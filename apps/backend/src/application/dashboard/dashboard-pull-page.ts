import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import {
  type CompletedCursor,
  completedCursorFrom,
  pageCompleted,
  pageCompletedByLines,
} from "./dashboard-completed-pull-window.js";
import { pullLineCountsForPulls, relativeTime } from "./dashboard-pull-details.js";
import type { DashboardCompletedPull, DashboardPull } from "./dashboard.facade.js";
import type {
  CompletedCandidate,
  DashboardOpenPullPageQuery,
  DashboardOpenPullPages,
  DashboardPullPage,
  DashboardPullPageQuery,
} from "./dashboard-pull-page-types.js";
import {
  emptyOpenBuckets,
  matchesOpenBucket,
  openBucketFor,
  OPEN_BUCKETS,
  partitionOpenCandidates,
} from "./dashboard-open-buckets.js";
import {
  collectRepoCandidatesForRepos,
  type DashboardCursor,
  type NormalizedQuery,
  type OpenCandidate,
  type PullPageDeps,
  type RepoRow,
} from "./dashboard-repo-pull-candidates.js";
import type { DashboardWorkspaceScope } from "./dashboard-workspace-scope.js";

const DEFAULT_PULL_PAGE_LIMIT = 20;
const MAX_PULL_PAGE_LIMIT = 50;
const REPO_FETCH_CONCURRENCY = 4;

type CollectedCandidates = {
  openCandidates: OpenCandidate[];
  completedCandidates: CompletedCandidate[];
  nextCompletedCursor: CompletedCursor;
};

export async function getDashboardPullPageForUser(
  user: { id: string; login: string },
  input: DashboardPullPageQuery,
  deps: PullPageDeps,
  scope: DashboardWorkspaceScope | null,
): Promise<DashboardPullPage> {
  const query = normalizeQuery(input);
  const cursor = decodeCursor(query.cursor);
  const { openCandidates, completedCandidates, nextCompletedCursor } =
    await collectCandidatesForUser(user, query, cursor, deps, scope);

  if (query.bucket === "completed") {
    return query.ordering === "lines"
      ? pageCompletedByLines(completedCandidates, nextCompletedCursor, query)
      : pageCompleted(completedCandidates, nextCompletedCursor, query);
  }
  const bucketCandidates = openCandidates.filter((candidate) =>
    matchesOpenBucket(query.bucket, user.login, candidate),
  );
  return query.ordering === "lines"
    ? pageByLines(await openPulls(bucketCandidates), cursor.offset, query)
    : pageOpen(bucketCandidates, cursor.offset, query);
}

export async function getDashboardOpenPullPagesForUser(
  user: { id: string; login: string },
  input: DashboardOpenPullPageQuery,
  deps: PullPageDeps,
  scope: DashboardWorkspaceScope | null,
): Promise<DashboardOpenPullPages> {
  const query = normalizeQuery({ ...input, bucket: "ready" });
  const { openCandidates } = await collectCandidatesForUser(
    user,
    query,
    { offset: 0 },
    deps,
    scope,
  );

  if (query.ordering === "lines") {
    return pagesByLines(openCandidates, await openPulls(openCandidates), user.login, query);
  }
  return pagesByUpdated(openCandidates, user.login, query);
}

async function collectCandidatesForUser(
  user: { id: string; login: string },
  query: NormalizedQuery,
  cursor: DashboardCursor,
  deps: PullPageDeps,
  scope: DashboardWorkspaceScope | null,
): Promise<CollectedCandidates> {
  const makeOctokit = deps.octokitFactory ?? createInstallationOctokit;
  const collected: CollectedCandidates = {
    openCandidates: [],
    completedCandidates: [],
    nextCompletedCursor: {
      repoPages: { ...cursor.completed?.repoPages },
      remaining: [],
    },
  };

  for (const installation of scope?.installations ?? []) {
    const repoRows = (scope?.repositories ?? []).filter(
      (repo) => repo.installationId === installation.id && repo.folioEnabled,
    ) as RepoRow[];
    if (repoRows.length === 0) {
      continue;
    }

    let octokit: Octokit;
    try {
      octokit = await makeOctokit(installation.githubInstallationId);
    } catch {
      continue;
    }

    const repoResults = await collectRepoCandidatesForRepos(repoRows, REPO_FETCH_CONCURRENCY, {
      octokit,
      user,
      query,
      cursor,
      deps,
    });
    for (const result of repoResults) {
      collected.openCandidates.push(...result.openCandidates);
      collected.completedCandidates.push(...result.completedCandidates);
      if (result.completedPage) {
        collected.nextCompletedCursor.repoPages[result.completedPage.repoKey] =
          result.completedPage.nextPage;
      }
    }
  }

  return collected;
}

async function openPulls(candidates: OpenCandidate[]): Promise<DashboardPull[]> {
  const lineCounts = await pullLineCountsForPulls(
    candidates.map((candidate) => ({
      octokit: candidate.octokit,
      owner: candidate.repo.owner,
      repo: candidate.repo.name,
      pullNumber: candidate.pr.number,
    })),
  );
  return candidates.map((candidate, index) => {
    const counts = lineCounts[index] ?? { additions: 0, deletions: 0, changedFiles: 0 };
    return {
      id: `${candidate.repo.owner}-${candidate.repo.name}-${candidate.pr.number}`,
      org: candidate.repo.owner,
      repo: candidate.repo.name,
      number: candidate.pr.number,
      title: candidate.pr.title,
      author: candidate.pr.user?.login ?? "unknown",
      updatedAt: relativeTime(candidate.pr.updated_at),
      headBranch: candidate.pr.head.ref,
      headSha: candidate.pr.head.sha ?? "",
      baseBranch: candidate.pr.base.ref,
      githubStatus: candidate.pr.merged_at
        ? "merged"
        : candidate.pr.draft
          ? "draft"
          : (candidate.pr.state ?? "open"),
      risk: "low",
      ...counts,
      ...candidate.status,
    };
  });
}

async function pageOpen(
  candidates: OpenCandidate[],
  offset: number,
  query: NormalizedQuery,
): Promise<DashboardPullPage> {
  const sorted = [...candidates].sort((a, b) => dateDelta(a.pr.updated_at, b.pr.updated_at, query));
  return page(await openPulls(sorted.slice(offset, offset + query.limit)), offset, sorted.length);
}

async function pagesByUpdated(
  candidates: OpenCandidate[],
  userLogin: string,
  query: NormalizedQuery,
): Promise<DashboardOpenPullPages> {
  const partitions = partitionOpenCandidates(candidates, userLogin);
  const selected = OPEN_BUCKETS.map((bucket) =>
    [...partitions[bucket]]
      .sort((a, b) => dateDelta(a.pr.updated_at, b.pr.updated_at, query))
      .slice(0, query.limit),
  );
  const pulls = await openPulls(selected.flat());
  let offset = 0;

  return Object.fromEntries(
    OPEN_BUCKETS.map((bucket, index) => {
      const length = selected[index]?.length ?? 0;
      const items = pulls.slice(offset, offset + length);
      offset += length;
      return [bucket, page(items, 0, partitions[bucket].length)];
    }),
  ) as DashboardOpenPullPages;
}

function pagesByLines(
  candidates: OpenCandidate[],
  pulls: DashboardPull[],
  userLogin: string,
  query: NormalizedQuery,
): DashboardOpenPullPages {
  const partitions = emptyOpenBuckets<DashboardPull>();
  candidates.forEach((candidate, index) => {
    const pull = pulls[index];
    if (pull) {
      partitions[openBucketFor(userLogin, candidate)].push(pull);
    }
  });
  return Object.fromEntries(
    OPEN_BUCKETS.map((bucket) => [bucket, pageByLines(partitions[bucket], 0, query)]),
  ) as DashboardOpenPullPages;
}

function pageByLines<T extends DashboardPull | DashboardCompletedPull>(
  pulls: T[],
  offset: number,
  query: NormalizedQuery,
): DashboardPullPage {
  const sorted = [...pulls].sort((a, b) => lineDelta(a, b, query));
  return page(sorted.slice(offset, offset + query.limit), offset, sorted.length);
}

function page<T extends DashboardPull | DashboardCompletedPull>(
  items: T[],
  offset: number,
  count: number,
): DashboardPullPage {
  const nextOffset = offset + items.length;
  return { items, nextCursor: nextOffset < count ? encodeCursor(nextOffset) : null, count };
}

function normalizeQuery(input: DashboardPullPageQuery): NormalizedQuery {
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

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): DashboardCursor {
  if (!cursor) {
    return { offset: 0 };
  }
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      offset?: unknown;
      completed?: CompletedCursor;
    };
    return {
      offset: typeof parsed.offset === "number" && parsed.offset >= 0 ? parsed.offset : 0,
      completed: completedCursorFrom(parsed.completed),
    };
  } catch {
    return { offset: 0 };
  }
}

function dateDelta(a: string, b: string, query: NormalizedQuery): number {
  const delta = new Date(a).getTime() - new Date(b).getTime();
  return query.direction === "asc" ? delta : -delta;
}

function lineDelta(
  a: DashboardPull | DashboardCompletedPull,
  b: DashboardPull | DashboardCompletedPull,
  query: NormalizedQuery,
): number {
  const delta = a.additions + a.deletions - (b.additions + b.deletions);
  return query.direction === "asc" ? delta : -delta;
}
