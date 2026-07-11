import type { DashboardPullPageQuery } from "./dashboard-pull-page-types.js";
import type { DashboardOpenBucket } from "./dashboard-pull-page-types.js";
import type { OpenCandidate } from "./dashboard-repo-pull-candidates.js";

export const OPEN_BUCKETS = ["ready", "yours", "other"] as const;

export function partitionOpenCandidates(
  candidates: OpenCandidate[],
  userLogin: string,
): Record<DashboardOpenBucket, OpenCandidate[]> {
  const partitions = emptyOpenBuckets<OpenCandidate>();
  for (const candidate of candidates) {
    if (candidate.status.analysisStatus === "complete") {
      continue;
    }
    partitions[openBucketFor(userLogin, candidate)].push(candidate);
  }
  return partitions;
}

export function emptyOpenBuckets<T>(): Record<DashboardOpenBucket, T[]> {
  return { ready: [], yours: [], other: [] };
}

export function matchesOpenBucket(
  bucket: DashboardPullPageQuery["bucket"],
  userLogin: string,
  candidate: OpenCandidate,
): boolean {
  return (
    bucket !== "completed" &&
    candidate.status.analysisStatus !== "complete" &&
    openBucketFor(userLogin, candidate) === bucket
  );
}

export function openBucketFor(userLogin: string, candidate: OpenCandidate): DashboardOpenBucket {
  if (!candidate.pr.head.sha) {
    if (candidate.pr.user?.login === userLogin) {
      return "yours";
    }
    return candidate.status.status === "ready" ? "ready" : "other";
  }
  if (candidate.status.analysisStatus !== "not_requested") {
    return "ready";
  }
  return candidate.pr.user?.login === userLogin ? "yours" : "other";
}
