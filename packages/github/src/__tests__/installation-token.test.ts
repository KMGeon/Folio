import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppAuthFn } from "../auth/installation-token.js";
import {
  configureInstallationAuth,
  getInstallationToken,
  resetInstallationAuth,
} from "../auth/installation-token.js";

afterEach(() => resetInstallationAuth());

const CFG = { appId: 1, privateKey: "PEM" };

function makeAuth(
  expiresInMs: number,
  nowRef: { t: number },
): {
  auth: AppAuthFn;
  calls: number[];
} {
  const calls: number[] = [];
  const auth: AppAuthFn = vi.fn(async ({ installationId }) => {
    calls.push(installationId);
    return {
      token: `tok-${installationId}-${calls.length}`,
      expiresAt: new Date(nowRef.t + expiresInMs).toISOString(),
    };
  });
  return { auth, calls };
}

describe("getInstallationToken", () => {
  it("caches per installation (second call is a hit)", async () => {
    const nowRef = { t: 1_000_000 };
    const { auth, calls } = makeAuth(3_600_000, nowRef);
    configureInstallationAuth(CFG, { authOverride: auth, now: () => nowRef.t });

    const a = await getInstallationToken(42);
    const b = await getInstallationToken(42);
    expect(a.token).toBe(b.token);
    expect(calls).toEqual([42]);
  });

  it("refreshes before the 1-hour expiry", async () => {
    const nowRef = { t: 0 };
    const { auth, calls } = makeAuth(3_600_000, nowRef);
    configureInstallationAuth(CFG, { authOverride: auth, now: () => nowRef.t });

    const first = await getInstallationToken(7);
    // Advance to within the 60s refresh leeway of expiry.
    nowRef.t = 3_600_000 - 30_000;
    const second = await getInstallationToken(7);
    expect(second.token).not.toBe(first.token);
    expect(calls).toEqual([7, 7]);
  });

  it("keeps separate installs isolated", async () => {
    const nowRef = { t: 0 };
    const { auth, calls } = makeAuth(3_600_000, nowRef);
    configureInstallationAuth(CFG, { authOverride: auth, now: () => nowRef.t });

    const a = await getInstallationToken(1);
    const b = await getInstallationToken(2);
    expect(a.token).not.toBe(b.token);
    expect(calls).toEqual([1, 2]);
  });

  it("throws if not configured", async () => {
    await expect(getInstallationToken(1)).rejects.toThrow(/not configured/);
  });
});
