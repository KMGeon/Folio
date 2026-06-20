import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../webhook/verify.js";

const SECRET = "s3cr3t-webhook-key";
const BODY = JSON.stringify({ action: "opened", number: 7 });

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("returns true for a correctly-signed body", () => {
    expect(verifyWebhookSignature(BODY, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("works with Buffer bodies identically", () => {
    const buf = Buffer.from(BODY, "utf8");
    expect(verifyWebhookSignature(buf, sign(BODY, SECRET), SECRET)).toBe(true);
  });

  it("returns false when the body is tampered", () => {
    const sig = sign(BODY, SECRET);
    expect(verifyWebhookSignature(`${BODY} `, sig, SECRET)).toBe(false);
  });

  it("returns false when the secret is wrong", () => {
    expect(verifyWebhookSignature(BODY, sign(BODY, SECRET), "wrong-secret")).toBe(false);
  });

  it("returns false (never throws) for a missing signature", () => {
    expect(verifyWebhookSignature(BODY, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(BODY, undefined, SECRET)).toBe(false);
  });

  it("returns false for a signature without the sha256= prefix", () => {
    const raw = createHmac("sha256", SECRET).update(BODY).digest("hex");
    expect(verifyWebhookSignature(BODY, raw, SECRET)).toBe(false);
  });

  it("returns false for an empty secret", () => {
    expect(verifyWebhookSignature(BODY, sign(BODY, SECRET), "")).toBe(false);
  });

  it("returns false for a length-mismatched signature (no throw)", () => {
    expect(verifyWebhookSignature(BODY, "sha256=abcd", SECRET)).toBe(false);
  });
});
