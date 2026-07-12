import { PR_INDEX_STATUS, repositoriesRepo } from "@folio/db";
import type { PullRequestIndexBackfill } from "./pull-request-index-backfill.js";

export async function enqueueBackfillForEnabledRepositories(
  backfill: Pick<PullRequestIndexBackfill, "enqueueForRepository">,
): Promise<{ enqueued: number; skippedReady: number }> {
  const repositories = await repositoriesRepo.listFolioEnabledWithGithubAccess();
  const pending = repositories.filter((repo) => repo.prIndexStatus !== PR_INDEX_STATUS.READY);

  for (const repo of pending) {
    await backfill.enqueueForRepository(repo.id);
  }

  return {
    enqueued: pending.length,
    skippedReady: repositories.length - pending.length,
  };
}
