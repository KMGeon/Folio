import { installationsRepo, repositoriesRepo } from "@folio/db";
import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import {
  type CompletedCursor,
  completedCursorFrom,
  pageCompleted,
  pageCompletedByLines,
} from "./dashboard-completed-pull-window.js";
import { pullLineCounts, relativeTime } from "./dashboard-pull-details.js";
import type { DashboardCompletedPull, DashboardPull } from "./dashboard.facade.js";
import type {
  CompletedCandidate,
  DashboardPullPage,
  DashboardPullPageQuery,
} from "./dashboard-pull-page-types.js";
import {
  collectRepoCandidatesForRepos,
  type DashboardCursor,
  type NormalizedQuery,
  type OpenCandidate,
  type PullPageDeps,
  type RepoRow,
} from "./dashboard-repo-pull-candidates.js";

const DEFAULT_PULL_PAGE_LIMIT = 20;
const MAX_PULL_PAGE_LIMIT = 50;
const REPO_FETCH_CONCURRENCY = 4;

export async function getDashboardPullPageForUser(
  user: { id: string; login: string },
  input: DashboardPullPageQuery,
  deps: PullPageDeps,
): Promise<DashboardPullPage> {
  const query = normalizeQuery(input);
  const cursor = decodeCursor(query.cursor);
  const makeOctokit = deps.octokitFactory ?? createInstallationOctokit;
  const openCandidates: OpenCandidate[] = [];
  const completedCandidates: CompletedCandidate[] = [];
  const nextCompletedCursor: CompletedCursor = {
    repoPages: { ...cursor.completed?.repoPages },
    remaining: [],
  };

  for (const installation of await installationsRepo.listByAccountLogin(user.login)) {
    const repoRows = (await repositoriesRepo.listByInstallation(installation.id)).filter(
      (repo) => repo.folioEnabled,
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
      openCandidates.push(...result.openCandidates);
      completedCandidates.push(...result.completedCandidates);
      if (result.completedPage) {
        nextCompletedCursor.repoPages[result.completedPage.repoKey] = result.completedPage.nextPage;
      }
    }
  }

  if (query.bucket === "completed") {
    return query.ordering === "lines"
      ? pageCompletedByLines(completedCandidates, nextCompletedCursor, query)
      : pageCompleted(completedCandidates, nextCompletedCursor, query);
  }
  return query.ordering === "lines"
    ? pageByLines(await openPulls(openCandidates), cursor.offset, query)
    : pageOpen(openCandidates, cursor.offset, query);
}

async function openPulls(candidates: OpenCandidate[]): Promise<DashboardPull[]> {
  const pulls: DashboardPull[] = [];
  for (const candidate of candidates) {
    const lineCounts = await pullLineCounts(
      candidate.octokit,
      candidate.repo.owner,
      candidate.repo.name,
      candidate.pr.number,
    );
    pulls.push({
      id: `${candidate.repo.owner}-${candidate.repo.name}-${candidate.pr.number}`,
      org: candidate.repo.owner,
      repo: candidate.repo.name,
      number: candidate.pr.number,
      title: candidate.pr.title,
      author: candidate.pr.user?.login ?? "unknown",
      updatedAt: relativeTime(candidate.pr.updated_at),
      headBranch: candidate.pr.head.ref,
      baseBranch: candidate.pr.base.ref,
      risk: "low",
      ...lineCounts,
      ...candidate.status,
    });
  }
  return pulls;
}

async function pageOpen(
  candidates: OpenCandidate[],
  offset: number,
  query: NormalizedQuery,
): Promise<DashboardPullPage> {
  const sorted = [...candidates].sort((a, b) => dateDelta(a.pr.updated_at, b.pr.updated_at, query));
  return page(await openPulls(sorted.slice(offset, offset + query.limit)), offset, sorted.length);
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
