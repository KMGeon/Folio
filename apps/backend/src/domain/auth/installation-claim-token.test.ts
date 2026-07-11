import { verifyWebhookSignature } from "@folio/github";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createInstallationClaimToken,
  verifyInstallationClaimToken,
} from "./installation-claim-token.js";

const secret = "test-webhook-secret";
const now = new Date("2026-07-11T00:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("installation claim token", () => {
  it("round-trips a user, installation, and future expiry", () => {
    vi.setSystemTime(now);
    const payload = {
      userId: "user-1",
      installationId: 123,
      expiresAt: now.getTime() + 10 * 60 * 1000,
    };

    const token = createInstallationClaimToken(payload, secret);

    expect(verifyInstallationClaimToken(token, secret)).toEqual(payload);
  });

  it.each([
    ["a different user", { userId: "attacker" }],
    ["a different installation", { installationId: 999 }],
  ] as const)("rejects a payload tampered to bind %s", (_description, replacement) => {
    vi.setSystemTime(now);
    const token = createInstallationClaimToken(
      { userId: "user-1", installationId: 123, expiresAt: now.getTime() + 60_000 },
      secret,
    );
    const [encodedPayload, signature] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload!, "base64url").toString("utf8"),
    ) as object;
    const tamperedPayload = Buffer.from(JSON.stringify({ ...payload, ...replacement })).toString(
      "base64url",
    );

    expect(verifyInstallationClaimToken(`${tamperedPayload}.${signature}`, secret)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.setSystemTime(now);
    const token = createInstallationClaimToken(
      { userId: "user-1", installationId: 123, expiresAt: now.getTime() + 1 },
      secret,
    );
    vi.setSystemTime(now.getTime() + 2);

    expect(verifyInstallationClaimToken(token, secret)).toBeNull();
  });

  it("rejects a token signed by another secret", () => {
    vi.setSystemTime(now);
    const token = createInstallationClaimToken(
      { userId: "user-1", installationId: 123, expiresAt: now.getTime() + 60_000 },
      secret,
    );

    expect(verifyInstallationClaimToken(token, "other-secret")).toBeNull();
  });

  it("cannot replay a claim signature as a valid GitHub webhook signature", () => {
    vi.setSystemTime(now);
    const token = createInstallationClaimToken(
      { userId: "user-1", installationId: 123, expiresAt: now.getTime() + 60_000 },
      secret,
    );
    const [encodedPayload, encodedSignature] = token.split(".");
    const rawBody = `folio-installation-claim.v1.${encodedPayload}`;
    const webhookHeader = `sha256=${Buffer.from(encodedSignature!, "base64url").toString("hex")}`;

    expect(verifyWebhookSignature(rawBody, webhookHeader, secret)).toBe(false);
  });
});
