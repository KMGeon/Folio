import { generateKeyPairSync, verify } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { MAX_JWT_TTL_SECONDS, createAppJwt, decodeJwtClaims } from "../auth/app-jwt.js";

let privateKey: string;
let publicKey: string;
const APP_ID = 123456;

beforeAll(() => {
  // Throwaway 2048-bit RSA key — never a real GitHub key.
  const pair = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
});

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

describe("createAppJwt", () => {
  it("issues iss === appId and exp - iat ≤ 600s", () => {
    const jwt = createAppJwt({ appId: APP_ID, privateKey });
    const claims = decodeJwtClaims(jwt);
    expect(claims.iss).toBe(APP_ID);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(MAX_JWT_TTL_SECONDS);
  });

  it("backdates iat by 60s for clock skew", () => {
    const now = 1_700_000_000_000;
    const jwt = createAppJwt({ appId: APP_ID, privateKey }, { now: () => now });
    const claims = decodeJwtClaims(jwt);
    expect(claims.iat).toBe(Math.floor(now / 1000) - 60);
  });

  it("clamps an over-large ttl to the 10-minute cap", () => {
    const jwt = createAppJwt({ appId: APP_ID, privateKey }, { ttlSeconds: 99_999 });
    const claims = decodeJwtClaims(jwt);
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(MAX_JWT_TTL_SECONDS);
  });

  it("produces an RS256 header", () => {
    const jwt = createAppJwt({ appId: APP_ID, privateKey });
    const header = JSON.parse(b64urlToBuf(jwt.split(".")[0] as string).toString("utf8"));
    expect(header).toMatchObject({ alg: "RS256", typ: "JWT" });
  });

  it("signs verifiably with the matching public key", () => {
    const jwt = createAppJwt({ appId: APP_ID, privateKey });
    const [h, p, s] = jwt.split(".");
    const signingInput = `${h}.${p}`;
    const ok = verify("RSA-SHA256", Buffer.from(signingInput), publicKey, b64urlToBuf(s as string));
    expect(ok).toBe(true);
  });

  it("fails verification if the signing input is altered", () => {
    const jwt = createAppJwt({ appId: APP_ID, privateKey });
    const [h, p, s] = jwt.split(".");
    const tampered = `${h}.${p}x`;
    const ok = verify("RSA-SHA256", Buffer.from(tampered), publicKey, b64urlToBuf(s as string));
    expect(ok).toBe(false);
  });
});
