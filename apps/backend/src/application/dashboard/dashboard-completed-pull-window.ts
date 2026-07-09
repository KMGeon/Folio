import { pullLineCounts, relativeTime } from "./dashboard-pull-details.js";
import { DASHBOARD_COMPLETED_PULL_DETAIL_TTL_MS } from "./dashboard-github-cache.js";
import type { DashboardCompletedPull } from "./dashboard.facade.js";
import type {
  CompletedCandidate,
  DashboardDirection,
  DashboardPullPage,
  GitHubPullSummary,
} from "./dashboard-pull-page-types.js";
import type { Octokit } from "octokit";

export type SerializedCompletedCandidate = Omit<CompletedCandidate, "octokit">;

export type CompletedCursor = {
  repoPages: Record<string, number | null>;
  remaining: SerializedCompletedCandidate[];
};

export const COMPLETED_PULL_LIMIT = 20;

export function completedCandidate(
  octokit: Octokit,
  owner: string,
  repo: string,
  pr: GitHubPullSummary,
): CompletedCandidate | null {
  const completedIso = pr.merged_at ?? pr.closed_at;
  return completedIso
    ? {
        owner,
        repo,
        octokit,
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? "unknown",
        completedIso,
        completedState: pr.merged_at ? "merged" : "closed",
      }
    : null;
}

export async function completedPulls(
  candidates: CompletedCandidate[],
): Promise<DashboardCompletedPull[]> {
  const pulls: DashboardCompletedPull[] = [];
  for (const candidate of candidates) {
    const lineCounts = await pullLineCounts(
      candidate.octokit,
      candidate.owner,
      candidate.repo,
      candidate.number,
      { ttlMs: DASHBOARD_COMPLETED_PULL_DETAIL_TTL_MS },
    );
    pulls.push({
      id: `${candidate.owner}-${candidate.repo}-${candidate.number}`,
      org: candidate.owner,
      repo: candidate.repo,
      number: candidate.number,
      title: candidate.title,
      author: candidate.author,
      completedAt: relativeTime(candidate.completedIso),
      completedState: candidate.completedState,
      additions: lineCounts.additions,
      deletions: lineCounts.deletions,
      changedFiles: lineCounts.changedFiles,
    });
  }
  return pulls;
}

export async function pageCompleted(
  candidates: CompletedCandidate[],
  cursor: CompletedCursor,
  query: { limit: number; direction: DashboardDirection },
): Promise<DashboardPullPage> {
  const sorted = candidates.sort((a, b) =>
    dateDelta(a.completedIso, b.completedIso, query.direction),
  );
  const pageCandidates = sorted.slice(0, query.limit);
  return {
    items: await completedPulls(pageCandidates),
    nextCursor: completedNextCursor(sorted.slice(query.limit), cursor),
    count: sorted.length,
  };
}

export async function pageCompletedByLines(
  candidates: CompletedCandidate[],
  cursor: CompletedCursor,
  query: { limit: number; direction: DashboardDirection },
): Promise<DashboardPullPage> {
  const enriched = await completedPulls(candidates);
  const sorted = enriched
    .map((pull, index) => ({ candidate: candidates[index], pull }))
    .sort((a, b) => lineDelta(a.pull, b.pull, query.direction));
  const pageRows = sorted.slice(0, query.limit);
  return {
    items: pageRows.map((row) => row.pull),
    nextCursor: completedNextCursor(
      sorted.flatMap((row) => (row.candidate ? [row.candidate] : [])).slice(query.limit),
      cursor,
    ),
    count: sorted.length,
  };
}

export function completedCursorFrom(value: unknown): CompletedCursor | undefined {
  const cursor = value as CompletedCursor | undefined;
  return cursor && typeof cursor === "object" && cursor.repoPages && Array.isArray(cursor.remaining)
    ? cursor
    : undefined;
}

function completedNextCursor(
  remaining: CompletedCandidate[],
  cursor: CompletedCursor,
): string | null {
  const nextCursor: CompletedCursor = {
    repoPages: cursor.repoPages,
    remaining: remaining.map(({ octokit: _octokit, ...candidate }) => candidate),
  };
  return nextCursor.remaining.length > 0 ||
    Object.values(nextCursor.repoPages).some((page) => page !== null)
    ? Buffer.from(JSON.stringify({ offset: 0, completed: nextCursor }), "utf8").toString(
        "base64url",
      )
    : null;
}

function dateDelta(a: string, b: string, direction: DashboardDirection): number {
  const delta = new Date(a).getTime() - new Date(b).getTime();
  return direction === "asc" ? delta : -delta;
}

function lineDelta(
  a: DashboardCompletedPull,
  b: DashboardCompletedPull,
  direction: DashboardDirection,
): number {
  const delta = a.additions + a.deletions - (b.additions + b.deletions);
  return direction === "asc" ? delta : -delta;
}
