import {
  JOB_KIND,
  chaptersRepo,
  dedupeKeyFor,
  getLatestJobsByDedupeKeys,
  pullRequestsRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";
import { projectReviewLifecycle, type ReviewAnalysisStatus } from "../review/review-lifecycle.js";
import type { DashboardReviewStatus } from "./dashboard.facade.js";

export type DashboardPullStatus = Record<
  "chapterCount" | "viewedChapters" | "changedFiles",
  number
> & {
  status: DashboardReviewStatus;
  analysisStatus: ReviewAnalysisStatus;
  completedAt: string | null;
};

const PROCESSING = {
  status: "processing" as const,
  chapterCount: 0,
  viewedChapters: 0,
  changedFiles: 0,
};

export async function resolveDashboardPullStatus(
  userId: string,
  repoId: string,
  repoFullName: string,
  prNumber: number,
  headSha: string,
): Promise<DashboardPullStatus> {
  const lifecycle = headSha ? await lifecycleForHead(repoFullName, headSha) : null;
  const pr = await pullRequestsRepo.getByRepoAndNumber(repoId, prNumber);
  if (!pr) {
    return { ...PROCESSING, ...(lifecycle ?? notRequested()) };
  }
  const revision = await revisionsRepo.latestForPr(pr.id);
  if (!revision) {
    return { ...PROCESSING, ...(lifecycle ?? notRequested()) };
  }
  const chapterRows = await chaptersRepo.listByRevision(revision.id);
  if (chapterRows.length === 0) {
    return { ...PROCESSING, ...(lifecycle ?? notRequested()) };
  }
  const { viewed } = await reviewStateRepo.progressForRevision(userId, revision.id);
  return {
    status: "ready",
    ...(lifecycle ?? { analysisStatus: "processing" as const, completedAt: null }),
    chapterCount: chapterRows.length,
    viewedChapters: viewed,
    changedFiles: new Set(chapterRows.flatMap((c) => c.hunkRefs.map((h) => h.filePath))).size,
  };
}

async function lifecycleForHead(repoFullName: string, headSha: string) {
  const key = dedupeKeyFor(repoFullName, headSha, JOB_KIND.REVIEW_PULL);
  return projectReviewLifecycle((await getLatestJobsByDedupeKeys([key])).get(key) ?? null);
}

function notRequested() {
  return { analysisStatus: "not_requested" as const, completedAt: null };
}
