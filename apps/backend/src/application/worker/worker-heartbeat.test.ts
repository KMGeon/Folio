import { afterEach, describe, expect, it, vi } from "vitest";
import { startWorkerHeartbeat } from "./worker-heartbeat.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("startWorkerHeartbeat", () => {
  it("writes immediately and on each interval", async () => {
    vi.useFakeTimers();
    const upsert = vi.fn(async () => undefined);
    const { stop } = startWorkerHeartbeat("worker-1", { upsert, intervalMs: 10_000 });

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith("worker-1");

    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsert).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(upsert).toHaveBeenCalledTimes(3);
    stop();
  });
});
