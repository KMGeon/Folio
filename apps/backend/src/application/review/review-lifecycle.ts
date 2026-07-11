import { JOB_STATUS, type Job } from "@folio/db";

export type ReviewAnalysisStatus =
  | "not_requested"
  | "processing"
  | "retrying"
  | "failed"
  | "complete";

export interface ReviewLifecycle {
  analysisStatus: ReviewAnalysisStatus;
  completedAt: string | null;
}

export function projectReviewLifecycle(job: Job | null): ReviewLifecycle {
  if (!job) {
    return { analysisStatus: "not_requested", completedAt: null };
  }
  if ([JOB_STATUS.PENDING, JOB_STATUS.CLAIMED, JOB_STATUS.RUNNING].includes(job.status as never)) {
    return { analysisStatus: "processing", completedAt: null };
  }
  if (job.status === JOB_STATUS.FAILED) {
    return { analysisStatus: "retrying", completedAt: null };
  }
  if (job.status !== JOB_STATUS.SUCCEEDED) {
    return { analysisStatus: "failed", completedAt: null };
  }
  const result = job.result as { commentUrl?: unknown; commentError?: unknown } | null;
  return typeof result?.commentUrl === "string" && result.commentUrl.length > 0
    ? { analysisStatus: "complete", completedAt: job.updatedAt.toISOString() }
    : { analysisStatus: "failed", completedAt: null };
}
