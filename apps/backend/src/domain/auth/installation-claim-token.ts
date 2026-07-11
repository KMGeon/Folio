import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const ClaimPayloadSchema = z.object({
  userId: z.string().min(1),
  installationId: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export interface InstallationClaimPayload {
  userId: string;
  installationId: number;
  expiresAt: number;
}

const SIGNATURE_DOMAIN = "folio-installation-claim.v1";

function sign(encodedPayload: string, secret: string): Buffer {
  // Domain separation lets the server-only webhook secret sign claims without creating a
  // signature that could be replayed as GitHub webhook verification evidence.
  return createHmac("sha256", secret).update(`${SIGNATURE_DOMAIN}.${encodedPayload}`).digest();
}

export function createInstallationClaimToken(
  input: InstallationClaimPayload,
  secret: string,
): string {
  if (!secret) {
    throw new Error("Installation claim signing secret is required");
  }
  const payload = ClaimPayloadSchema.parse(input);
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret).toString("base64url")}`;
}

export function verifyInstallationClaimToken(
  token: string,
  secret: string,
): InstallationClaimPayload | null {
  if (!secret) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return null;
  }

  try {
    const actualSignature = Buffer.from(encodedSignature, "base64url");
    const expectedSignature = sign(encodedPayload, secret);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      return null;
    }
    const parsed = ClaimPayloadSchema.safeParse(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")),
    );
    if (!parsed.success || parsed.data.expiresAt <= Date.now()) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
