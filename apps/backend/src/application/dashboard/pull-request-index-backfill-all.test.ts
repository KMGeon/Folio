import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueBackfillForEnabledRepositories } from "./pull-request-index-backfill-all.js";

const listFolioEnabledWithGithubAccess = vi.fn();

vi.mock("@folio/db", () => ({
  PR_INDEX_STATUS: { READY: "ready" },
  repositoriesRepo: {
    listFolioEnabledWithGithubAccess: (...args: unknown[]) =>
      listFolioEnabledWithGithubAccess(...args),
  },
}));

describe("enqueueBackfillForEnabledRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues active enabled repositories whose index is not ready", async () => {
    listFolioEnabledWithGithubAccess.mockResolvedValue([
      { id: "idle-repo", prIndexStatus: "idle" },
      { id: "error-repo", prIndexStatus: "error" },
      { id: "ready-repo", prIndexStatus: "ready" },
    ]);
    const backfill = { enqueueForRepository: vi.fn(async () => undefined) };

    const result = await enqueueBackfillForEnabledRepositories(backfill as never);

    expect(backfill.enqueueForRepository.mock.calls).toEqual([["idle-repo"], ["error-repo"]]);
    expect(result).toEqual({ enqueued: 2, skippedReady: 1 });
  });
});
