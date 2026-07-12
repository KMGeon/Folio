import {
  JOB_KIND,
  chaptersRepo,
  dedupeKeyFor,
  getLatestJobsByDedupeKeys,
  pullRequestsRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";
import { projectReviewLifecycle } from "../review/review-lifecycle.js";
import type { DashboardPullStatus } from "./dashboard-review-status.js";

export type DashboardPullStatusKey = {
  repoId: string;
  repoFullName: string;
  prNumber: number;
  headSha: string;
};

const EMPTY: DashboardPullStatus = {
  status: "processing",
  analysisStatus: "not_requested",
  completedAt: null,
  chapterCount: 0,
  viewedChapters: 0,
  changedFiles: 0,
};

/**
 * Batch review-status resolution for list endpoints. Avoids N per-PR query
 * fan-out when building open board pages from the index.
 */
export async function resolveDashboardPullStatuses(
  userId: string,
  keys: DashboardPullStatusKey[],
): Promise<Map<string, DashboardPullStatus>> {
  const result = new Map<string, DashboardPullStatus>();
  if (keys.length === 0) {
    return result;
  }

  const jobKeys = keys
    .filter((key) => key.headSha)
    .map((key) => dedupeKeyFor(key.repoFullName, key.headSha, JOB_KIND.REVIEW_PULL));
  const jobsByDedupe = await getLatestJobsByDedupeKeys([...new Set(jobKeys)]);

  // Sequential lookups remain per key for now but share the job map; a full SQL
  // multi-row join can replace this if list sizes grow into thousands.
  await Promise.all(
    keys.map(async (key) => {
      const mapKey = `${key.repoId}:${key.prNumber}`;
      const lifecycle = key.headSha
        ? projectReviewLifecycle(
            jobsByDedupe.get(dedupeKeyFor(key.repoFullName, key.headSha, JOB_KIND.REVIEW_PULL)) ??
              null,
          )
        : null;

      const pr = await pullRequestsRepo.getByRepoAndNumber(key.repoId, key.prNumber);
      if (!pr) {
        result.set(mapKey, {
          ...EMPTY,
          ...(lifecycle ?? { analysisStatus: "not_requested", completedAt: null }),
        });
        return;
      }
      const revision = await revisionsRepo.latestForPr(pr.id);
      if (!revision) {
        result.set(mapKey, {
          ...EMPTY,
          ...(lifecycle ?? { analysisStatus: "not_requested", completedAt: null }),
        });
        return;
      }
      const chapterRows = await chaptersRepo.listByRevision(revision.id);
      if (chapterRows.length === 0) {
        result.set(mapKey, {
          ...EMPTY,
          ...(lifecycle ?? { analysisStatus: "not_requested", completedAt: null }),
        });
        return;
      }
      const { viewed } = await reviewStateRepo.progressForRevision(userId, revision.id);
      result.set(mapKey, {
        status: "ready",
        ...(lifecycle ?? { analysisStatus: "processing" as const, completedAt: null }),
        chapterCount: chapterRows.length,
        viewedChapters: viewed,
        changedFiles: new Set(chapterRows.flatMap((c) => c.hunkRefs.map((h) => h.filePath))).size,
      });
    }),
  );

  return result;
}
