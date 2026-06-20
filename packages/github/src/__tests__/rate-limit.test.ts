import { describe, expect, it, vi } from "vitest";
import { RateLimitError, withRateLimitRetry } from "../rate-limit.js";

function rateLimitErr(headers: Record<string, string>, status = 429): unknown {
  return { status, response: { headers } };
}

describe("withRateLimitRetry", () => {
  it("retries on 429 and succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr({ "retry-after": "1" }))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withRateLimitRetry(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("honors Retry-After over x-ratelimit-reset", async () => {
    const now = 10_000_000;
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        rateLimitErr({ "retry-after": "2", "x-ratelimit-reset": String(now / 1000 + 999) }),
      )
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRateLimitRetry(fn, { sleep, now: () => now });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("falls back to x-ratelimit-reset when no Retry-After", async () => {
    const now = 1_000_000;
    const resetSec = now / 1000 + 5; // 5 seconds out
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr({ "x-ratelimit-reset": String(resetSec) }))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRateLimitRetry(fn, { sleep, now: () => now });
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it("caps the wait at maxDelayMs", async () => {
    const now = 0;
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr({ "retry-after": "9999" }))
      .mockResolvedValueOnce("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRateLimitRetry(fn, { sleep, now: () => now, maxDelayMs: 60_000 });
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("throws RateLimitError after maxAttempts", async () => {
    const fn = vi.fn().mockRejectedValue(rateLimitErr({ "retry-after": "1" }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRateLimitRetry(fn, { sleep, maxAttempts: 3 })).rejects.toBeInstanceOf(
      RateLimitError,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("propagates non-rate-limit errors immediately", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 404 });
    await expect(withRateLimitRetry(fn)).rejects.toMatchObject({ status: 404 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("RateLimitError carries a resetAt date", async () => {
    const now = 5_000_000;
    const fn = vi.fn().mockRejectedValue(rateLimitErr({ "retry-after": "3" }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    try {
      await withRateLimitRetry(fn, { sleep, maxAttempts: 1, now: () => now });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).resetAt).toBeInstanceOf(Date);
    }
  });
});
