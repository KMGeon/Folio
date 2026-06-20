import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a GitHub webhook's `X-Hub-Signature-256` header against the raw request
 * body using HMAC-SHA256 and the shared webhook secret. Comparison is
 * constant-time. Returns `false` for any malformed/missing input — it never
 * throws, so the webhook endpoint (I1) can branch on a boolean safely.
 *
 * IMPORTANT: pass the *raw* body bytes exactly as received. Re-serializing JSON
 * changes the bytes and breaks the HMAC.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string | null | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) {
    return false;
  }
  if (!signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch; guard so we stay branch-quiet.
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
