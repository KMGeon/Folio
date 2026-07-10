import { describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PULL_DETAIL_CONCURRENCY,
  pullLineCountsForPulls,
} from "./dashboard-pull-details.js";

describe("dashboard pull detail batching", () => {
  it("loads details concurrently up to the limit and preserves order", async () => {
    const pending = new Map<number, ReturnType<typeof deferred<PullDetail>>>();
    let active = 0;
    let maxActive = 0;
    const get = vi.fn(({ pull_number }: { pull_number: number }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      const call = deferred<PullDetail>();
      pending.set(pull_number, call);
      return call.promise.finally(() => {
        active -= 1;
      });
    });
    const octokit = { rest: { pulls: { get } } } as never;
    const resultPromise = pullLineCountsForPulls(
      Array.from({ length: 6 }, (_, index) => ({
        octokit,
        owner: "KMGeon",
        repo: "Folio",
        pullNumber: index + 1,
      })),
    );

    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(DASHBOARD_PULL_DETAIL_CONCURRENCY));
    expect(maxActive).toBe(DASHBOARD_PULL_DETAIL_CONCURRENCY);
    pending.get(1)?.resolve(detail(1));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(6));
    for (const number of [6, 2, 5, 3, 4]) {
      pending.get(number)?.resolve(detail(number));
    }

    await expect(resultPromise).resolves.toEqual(
      Array.from({ length: 6 }, (_, index) => ({
        additions: index + 1,
        deletions: 0,
        changedFiles: 1,
      })),
    );
  });
});

type PullDetail = { data: { additions: number; deletions: number; changed_files: number } };
const detail = (number: number): PullDetail => ({
  data: { additions: number, deletions: 0, changed_files: 1 },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
