import type { Octokit } from "octokit";
import {
  DASHBOARD_OPEN_PULL_DETAIL_TTL_MS,
  cachedDashboardGithubRequest,
} from "./dashboard-github-cache.js";

export type PullLineCounts = Record<"additions" | "deletions" | "changedFiles", number>;

export const DASHBOARD_PULL_DETAIL_CONCURRENCY = 5;

export type PullLineCountRequest = {
  octokit: Octokit;
  owner: string;
  repo: string;
  pullNumber: number;
  ttlMs?: number;
};

const EMPTY_LINE_COUNTS: PullLineCounts = {
  additions: 0,
  deletions: 0,
  changedFiles: 0,
};

export async function pullLineCounts(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
  opts?: { ttlMs?: number },
): Promise<PullLineCounts> {
  try {
    const { data } = await cachedDashboardGithubRequest(
      `pulls:get:${owner}/${repo}#${pullNumber}`,
      opts?.ttlMs ?? DASHBOARD_OPEN_PULL_DETAIL_TTL_MS,
      () =>
        octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        }),
    );
    return {
      additions: data.additions ?? 0,
      deletions: data.deletions ?? 0,
      changedFiles: data.changed_files ?? 0,
    };
  } catch {
    return EMPTY_LINE_COUNTS;
  }
}

export async function pullLineCountsForPulls(
  requests: PullLineCountRequest[],
): Promise<PullLineCounts[]> {
  const results = Array.from({ length: requests.length }, () => EMPTY_LINE_COUNTS);
  let nextIndex = 0;
  // Bound GitHub detail requests so a cold dashboard can overlap I/O without causing a burst.
  const workers = Array.from(
    { length: Math.min(DASHBOARD_PULL_DETAIL_CONCURRENCY, requests.length) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        const request = requests[index];
        if (!request) {
          return;
        }
        results[index] = await pullLineCounts(
          request.octokit,
          request.owner,
          request.repo,
          request.pullNumber,
          request.ttlMs ? { ttlMs: request.ttlMs } : undefined,
        );
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) {
    return "방금";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}시간 전` : `${Math.floor(hours / 24)}일 전`;
}
