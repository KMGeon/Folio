import { PR_INDEX_STATUS, type PullRequestIndexRow } from "@folio/db";
import type { DashboardCompletedPull, DashboardPull } from "./dashboard.facade.js";
import { relativeTime } from "./dashboard-pull-details.js";
import type {
  DashboardClosedRange,
  DashboardOpenPullPages,
  DashboardPullPage,
  DashboardPullPageQuery,
} from "./dashboard-pull-page-types.js";
import type { OpenCandidate, PullStatus, RepoRow } from "./dashboard-repo-pull-candidates.js";
import { resolveDashboardPullStatuses } from "./dashboard-review-status-batch.js";
import type { DashboardWorkspaceScope } from "./dashboard-workspace-scope.js";
import { OPEN_BUCKETS } from "./dashboard-open-buckets.js";

export const DEFAULT_PULL_PAGE_LIMIT = 20;
export const MAX_PULL_PAGE_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export type NormalizedIndexQuery = Required<Omit<DashboardPullPageQuery, "cursor" | "q">> & {
  cursor?: string;
  q?: string;
};

export type IndexOpenCandidate = {
  repo: RepoRow;
  row: PullRequestIndexRow;
  status: PullStatus;
};

export async function toOpenCandidates(
  user: { id: string; login: string },
  rows: PullRequestIndexRow[],
  byRepo: Map<string, RepoRow>,
  q: string | undefined,
): Promise<IndexOpenCandidate[]> {
  const filtered: { repo: RepoRow; row: PullRequestIndexRow }[] = [];
  for (const row of rows) {
    const repo = byRepo.get(row.repoId);
    if (!repo) {
      continue;
    }
    if (!matchesPullQuery(q, repo.name, row.githubPrNumber, row.title, row.authorLogin)) {
      continue;
    }
    filtered.push({ repo, row });
  }

  const statuses = await resolveDashboardPullStatuses(
    user.id,
    filtered.map(({ repo, row }) => ({
      repoId: repo.id,
      repoFullName: repo.fullName,
      prNumber: row.githubPrNumber,
      headSha: row.headSha,
    })),
  );

  return filtered.map(({ repo, row }) => ({
    repo,
    row,
    status:
      statuses.get(`${repo.id}:${row.githubPrNumber}`) ??
      ({
        status: "processing",
        analysisStatus: "not_requested",
        completedAt: null,
        chapterCount: 0,
        viewedChapters: 0,
        changedFiles: row.changedFiles,
      } satisfies PullStatus),
  }));
}

export function toLegacyCandidate(candidate: IndexOpenCandidate): OpenCandidate {
  return {
    // octokit is unused once cards are built from the index; placeholder for type compat.
    octokit: null as never,
    repo: candidate.repo,
    pr: {
      number: candidate.row.githubPrNumber,
      title: candidate.row.title,
      updated_at: candidate.row.githubUpdatedAt.toISOString(),
      user: { login: candidate.row.authorLogin },
      head: { ref: candidate.row.headRef, sha: candidate.row.headSha },
      base: { ref: candidate.row.baseRef },
      draft: candidate.row.isDraft,
      state: candidate.row.githubState,
      merged_at: candidate.row.mergedAt?.toISOString() ?? null,
      closed_at: candidate.row.closedAt?.toISOString() ?? null,
    },
    status: candidate.status,
  };
}

export function toOpenPull(candidate: IndexOpenCandidate): DashboardPull {
  const { repo, row, status } = candidate;
  return {
    id: `${repo.owner}-${repo.name}-${row.githubPrNumber}`,
    org: repo.owner,
    repo: repo.name,
    number: row.githubPrNumber,
    title: row.title,
    author: row.authorLogin,
    updatedAt: relativeTime(row.githubUpdatedAt.toISOString()),
    updatedAtIso: row.githubUpdatedAt.toISOString(),
    headBranch: row.headRef,
    headSha: row.headSha,
    baseBranch: row.baseRef,
    githubStatus: row.mergedAt
      ? "merged"
      : row.isDraft
        ? "draft"
        : row.githubState === "closed"
          ? "closed"
          : "open",
    risk: "low",
    additions: row.additions,
    deletions: row.deletions,
    // Prefer index line/file stats for the board card.
    changedFiles: row.changedFiles,
    status: status.status,
    analysisStatus: status.analysisStatus,
    completedAt: status.completedAt,
    chapterCount: status.chapterCount,
    viewedChapters: status.viewedChapters,
  };
}

export function toCompletedPull(
  repo: RepoRow,
  row: PullRequestIndexRow,
  completedIso: string,
): DashboardCompletedPull {
  return {
    id: `${repo.owner}-${repo.name}-${row.githubPrNumber}`,
    org: repo.owner,
    repo: repo.name,
    number: row.githubPrNumber,
    title: row.title,
    author: row.authorLogin,
    completedAt: relativeTime(completedIso),
    completedState: row.mergedAt ? "merged" : "closed",
    githubStatus: row.mergedAt ? "merged" : "closed",
    analysisStatus: "complete",
    additions: row.additions,
    deletions: row.deletions,
    changedFiles: row.changedFiles,
  };
}

export function readyRepoRows(scope: DashboardWorkspaceScope | null): RepoRow[] {
  return (scope?.repositories ?? [])
    .filter((repo) => repo.folioEnabled && repo.prIndexStatus === PR_INDEX_STATUS.READY)
    .map((repo) => ({
      id: repo.id,
      owner: repo.owner,
      name: repo.name,
      fullName: repo.fullName,
      folioEnabled: repo.folioEnabled,
    }));
}

export function isOpenish(row: PullRequestIndexRow, showDrafts: boolean): boolean {
  if (row.githubState !== "open") {
    return false;
  }
  if (!showDrafts && row.isDraft) {
    return false;
  }
  return true;
}

export function matchesPullQuery(
  q: string | undefined,
  repo: string,
  number: number,
  title: string,
  author: string | undefined,
): boolean {
  const needle = q?.toLowerCase();
  return needle
    ? [repo, String(number), title, author ?? "unknown"].some((value) =>
        value.toLowerCase().includes(needle),
      )
    : true;
}

export function matchesClosedRange(completedIso: string, range: DashboardClosedRange): boolean {
  if (range === "all") {
    return true;
  }
  const days = range === "1d" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return Date.now() - new Date(completedIso).getTime() <= days * DAY_MS;
}

export function normalizeQuery(input: DashboardPullPageQuery): NormalizedIndexQuery {
  return {
    bucket: input.bucket,
    limit: Math.min(Math.max(input.limit ?? DEFAULT_PULL_PAGE_LIMIT, 1), MAX_PULL_PAGE_LIMIT),
    cursor: input.cursor,
    q: input.q?.trim() || undefined,
    ordering: input.ordering ?? "updated",
    direction: input.direction ?? "desc",
    closedRange: input.closedRange ?? "all",
    showDrafts: input.showDrafts ?? true,
  };
}

export function decodeOffset(cursor: string | undefined): number {
  if (!cursor) {
    return 0;
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      offset?: unknown;
    };
    return typeof parsed.offset === "number" && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    return 0;
  }
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function pageSlice<T>(items: T[], offset: number, limit: number): DashboardPullPage {
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  return {
    items: slice as DashboardPullPage["items"],
    count: items.length,
    nextCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
  };
}

export function emptyPage(): DashboardPullPage {
  return { items: [], count: 0, nextCursor: null };
}

export function emptyOpenPages(): DashboardOpenPullPages {
  return Object.fromEntries(
    OPEN_BUCKETS.map((bucket) => [bucket, emptyPage()]),
  ) as DashboardOpenPullPages;
}

export function dateDelta(a: string, b: string, direction: "asc" | "desc"): number {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) {
    return 0;
  }
  const delta = aMs - bMs;
  return direction === "asc" ? delta : -delta;
}

export function lineDelta(
  a: { additions: number; deletions: number },
  b: { additions: number; deletions: number },
  direction: "asc" | "desc",
): number {
  const delta = a.additions + a.deletions - (b.additions + b.deletions);
  return direction === "asc" ? delta : -delta;
}
