import { type PullRequestIndexRow, pullRequestIndexRepo } from "@folio/db";
import type { DashboardCompletedPull } from "./dashboard.facade.js";
import {
  dateDelta,
  emptyOpenPages,
  emptyPage,
  isOpenish,
  lineDelta,
  matchesClosedRange,
  matchesPullQuery,
  normalizeQuery,
  pageSlice,
  readyRepoRows,
  toCompletedPull,
  toLegacyCandidate,
  toOpenCandidates,
  toOpenPull,
  decodeOffset,
  type IndexOpenCandidate,
} from "./dashboard-index-pull-map.js";
import {
  matchesOpenBucket,
  OPEN_BUCKETS,
  partitionOpenCandidates,
} from "./dashboard-open-buckets.js";
import type {
  DashboardOpenPullPageQuery,
  DashboardOpenPullPages,
  DashboardPullPage,
  DashboardPullPageQuery,
} from "./dashboard-pull-page-types.js";
import type { RepoRow } from "./dashboard-repo-pull-candidates.js";
import type { DashboardWorkspaceScope } from "./dashboard-workspace-scope.js";

/**
 * Build dashboard open/completed pages from pull_request_index only.
 * Callers must not hit GitHub on this path.
 */
export async function getDashboardPullPageFromIndex(
  user: { id: string; login: string },
  input: DashboardPullPageQuery,
  scope: DashboardWorkspaceScope | null,
): Promise<DashboardPullPage> {
  const query = normalizeQuery(input);
  const offset = decodeOffset(query.cursor);
  const readyRepos = readyRepoRows(scope);
  if (readyRepos.length === 0) {
    return emptyPage();
  }

  const rows = await pullRequestIndexRepo.listByRepoIds(readyRepos.map((repo) => repo.id));
  const byRepo = new Map(readyRepos.map((repo) => [repo.id, repo]));

  if (query.bucket === "completed") {
    return pageCompletedFromIndex(rows, byRepo, query, offset);
  }

  const openRows = rows.filter((row) => isOpenish(row, query.showDrafts));
  const candidates = await toOpenCandidates(user, openRows, byRepo, query.q);
  const bucketCandidates = candidates.filter((candidate) =>
    matchesOpenBucket(query.bucket, user.login, toLegacyCandidate(candidate)),
  );
  const pulls = bucketCandidates
    .map((candidate) => toOpenPull(candidate))
    .sort((a, b) =>
      query.ordering === "lines"
        ? lineDelta(a, b, query.direction)
        : dateDelta(a.updatedAtIso, b.updatedAtIso, query.direction),
    );
  return pageSlice(pulls, offset, query.limit);
}

export async function getDashboardOpenPullPagesFromIndex(
  user: { id: string; login: string },
  input: DashboardOpenPullPageQuery,
  scope: DashboardWorkspaceScope | null,
): Promise<DashboardOpenPullPages> {
  const query = normalizeQuery({ ...input, bucket: "ready" });
  const readyRepos = readyRepoRows(scope);
  if (readyRepos.length === 0) {
    return emptyOpenPages();
  }

  const rows = await pullRequestIndexRepo.listOpenByRepoIds(readyRepos.map((repo) => repo.id));
  const byRepo = new Map(readyRepos.map((repo) => [repo.id, repo]));
  const openRows = rows.filter((row) => isOpenish(row, query.showDrafts));
  const candidates = await toOpenCandidates(user, openRows, byRepo, query.q);
  const legacy = candidates.map(toLegacyCandidate);
  const partitions = partitionOpenCandidates(legacy, user.login);

  const byKey = new Map(
    candidates.map((candidate) => [
      `${candidate.repo.id}:${candidate.row.githubPrNumber}`,
      candidate,
    ]),
  );

  return Object.fromEntries(
    OPEN_BUCKETS.map((bucket) => {
      const bucketLegacy = partitions[bucket];
      const bucketPulls = bucketLegacy
        .map((item) => byKey.get(`${item.repo.id}:${item.pr.number}`))
        .filter((item): item is IndexOpenCandidate => item !== undefined)
        .map((item) => toOpenPull(item))
        .sort((a, b) =>
          query.ordering === "lines"
            ? lineDelta(a, b, query.direction)
            : dateDelta(a.updatedAtIso, b.updatedAtIso, query.direction),
        );
      return [bucket, pageSlice(bucketPulls, 0, query.limit)];
    }),
  ) as DashboardOpenPullPages;
}

function pageCompletedFromIndex(
  rows: PullRequestIndexRow[],
  byRepo: Map<string, RepoRow>,
  query: ReturnType<typeof normalizeQuery>,
  offset: number,
): DashboardPullPage {
  const completed = rows
    .filter((row) => row.githubState === "closed")
    .map((row) => {
      const repo = byRepo.get(row.repoId);
      if (!repo) {
        return null;
      }
      const completedIso = (row.mergedAt ?? row.closedAt ?? row.githubUpdatedAt).toISOString();
      if (!matchesClosedRange(completedIso, query.closedRange)) {
        return null;
      }
      if (!matchesPullQuery(query.q, repo.name, row.githubPrNumber, row.title, row.authorLogin)) {
        return null;
      }
      return {
        pull: toCompletedPull(repo, row, completedIso),
        completedIso,
        lines: row.additions + row.deletions,
      };
    })
    .filter(
      (item): item is { pull: DashboardCompletedPull; completedIso: string; lines: number } =>
        item !== null,
    )
    .sort((a, b) => {
      if (query.ordering === "lines") {
        const delta = a.lines - b.lines;
        return query.direction === "asc" ? delta : -delta;
      }
      return dateDelta(a.completedIso, b.completedIso, query.direction);
    })
    .map((item) => item.pull);

  return pageSlice(completed, offset, query.limit);
}
