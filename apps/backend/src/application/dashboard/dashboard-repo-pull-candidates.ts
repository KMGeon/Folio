import type { Octokit } from "octokit";
import type { ReviewAnalysisStatus } from "../review/review-lifecycle.js";
import {
  COMPLETED_PULL_LIMIT,
  type CompletedCursor,
  completedCandidate,
} from "./dashboard-completed-pull-window.js";
import type { DashboardReviewStatus } from "./dashboard.facade.js";
import type {
  CompletedCandidate,
  DashboardClosedRange,
  DashboardDirection,
  DashboardPullPageQuery,
  GitHubPullSummary,
} from "./dashboard-pull-page-types.js";

export type PullStatus = Record<"chapterCount" | "viewedChapters" | "changedFiles", number> & {
  status: DashboardReviewStatus;
  analysisStatus: ReviewAnalysisStatus;
  completedAt: string | null;
};
export type RepoRow = {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  folioEnabled: boolean;
};
export type OpenCandidate = {
  octokit: Octokit;
  repo: RepoRow;
  pr: GitHubPullSummary;
  status: PullStatus;
};
export type NormalizedQuery = Required<
  Omit<DashboardPullPageQuery, "cursor" | "q" | "repository">
> & {
  cursor?: string;
  q?: string;
};
export type DashboardCursor = { offset: number; completed?: CompletedCursor };
export type PullPageDeps = {
  octokitFactory?: (githubInstallationId: number) => Promise<Octokit>;
  listPulls: (
    octokit: Octokit,
    owner: string,
    repo: string,
    state: "open" | "closed" | "all",
    page?: number,
    direction?: DashboardDirection,
  ) => Promise<GitHubPullSummary[]>;
  resolveStatus: (
    userId: string,
    repoId: string,
    repoFullName: string,
    prNumber: number,
    headSha: string,
  ) => Promise<PullStatus>;
};

export type RepoCandidateResult = {
  openCandidates: OpenCandidate[];
  completedCandidates: CompletedCandidate[];
  completedPage?: { repoKey: string; nextPage: number | null };
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function collectRepoCandidatesForRepos(
  repos: RepoRow[],
  concurrency: number,
  input: {
    octokit: Octokit;
    user: { id: string; login: string };
    query: NormalizedQuery;
    cursor: DashboardCursor;
    deps: PullPageDeps;
  },
): Promise<RepoCandidateResult[]> {
  return mapDashboardRepos(repos, concurrency, (repo) =>
    collectRepoCandidates(repo, input.octokit, input.user, input.query, input.cursor, input.deps),
  );
}

async function collectRepoCandidates(
  repo: RepoRow,
  octokit: Octokit,
  user: { id: string; login: string },
  query: NormalizedQuery,
  cursor: DashboardCursor,
  deps: PullPageDeps,
): Promise<RepoCandidateResult> {
  const repoKey = `${repo.owner}/${repo.name}`;
  const completedCandidates: CompletedCandidate[] =
    query.bucket === "completed"
      ? (cursor.completed?.remaining ?? [])
          .filter((candidate) => `${candidate.owner}/${candidate.repo}` === repoKey)
          .map((candidate) => ({ ...candidate, octokit }))
      : [];

  let pulls: GitHubPullSummary[];
  let page: number | null | undefined;
  try {
    page =
      cursor.completed && Object.hasOwn(cursor.completed.repoPages, repoKey)
        ? cursor.completed.repoPages[repoKey]
        : 1;
    if (query.bucket === "completed" && page == null) {
      return { openCandidates: [], completedCandidates };
    }
    pulls = await deps.listPulls(
      octokit,
      repo.owner,
      repo.name,
      query.bucket === "completed" ? "all" : "open",
      query.bucket === "completed" ? (page ?? undefined) : undefined,
      query.bucket === "completed" ? query.direction : undefined,
    );
  } catch {
    return { openCandidates: [], completedCandidates };
  }

  if (query.bucket === "completed") {
    completedCandidates.push(
      ...(await completedCandidatesForRepo(pulls, octokit, repo, user, query, deps)),
    );
    return {
      openCandidates: [],
      completedCandidates,
      completedPage: {
        repoKey,
        nextPage: pulls.length >= COMPLETED_PULL_LIMIT ? (page ?? 1) + 1 : null,
      },
    };
  }

  const openCandidates = await openCandidatesForRepo(pulls, octokit, repo, user, query, deps);
  return { openCandidates, completedCandidates };
}

async function completedCandidatesForRepo(
  pulls: GitHubPullSummary[],
  octokit: Octokit,
  repo: RepoRow,
  user: { id: string; login: string },
  query: NormalizedQuery,
  deps: PullPageDeps,
): Promise<CompletedCandidate[]> {
  const candidates = await Promise.all(
    pulls.map(async (pr): Promise<CompletedCandidate | null> => {
      if (!matchesPullQuery(query.q, repo.name, pr.number, pr.title, pr.user?.login)) {
        return null;
      }
      if (!pr.head.sha) {
        const legacy = completedCandidate(octokit, repo.owner, repo.name, pr);
        return legacy && matchesClosedRange(legacy.completedIso, query.closedRange)
          ? { ...legacy, analysisStatus: "complete" }
          : null;
      }
      const status = await deps.resolveStatus(
        user.id,
        repo.id,
        repo.fullName,
        pr.number,
        pr.head.sha ?? "",
      );
      if (status.analysisStatus !== "complete" || !status.completedAt) {
        return null;
      }
      if (!matchesClosedRange(status.completedAt, query.closedRange)) {
        return null;
      }
      return {
        octokit,
        owner: repo.owner,
        repo: repo.name,
        number: pr.number,
        title: pr.title,
        author: pr.user?.login ?? "unknown",
        completedIso: status.completedAt,
        completedState: pr.merged_at ? "merged" : pr.draft ? "draft" : (pr.state ?? "open"),
        analysisStatus: "complete",
      };
    }),
  );
  return candidates.filter((candidate): candidate is CompletedCandidate => candidate !== null);
}

async function openCandidatesForRepo(
  pulls: GitHubPullSummary[],
  octokit: Octokit,
  repo: RepoRow,
  user: { id: string; login: string },
  query: NormalizedQuery,
  deps: PullPageDeps,
): Promise<OpenCandidate[]> {
  const candidates = await Promise.all(
    pulls.map(async (pr) => {
      if (!query.showDrafts && pr.draft === true) {
        return null;
      }
      if (!matchesPullQuery(query.q, repo.name, pr.number, pr.title, pr.user?.login)) {
        return null;
      }
      const status = await deps.resolveStatus(
        user.id,
        repo.id,
        repo.fullName,
        pr.number,
        pr.head.sha ?? "",
      );
      return { octokit, repo, pr, status };
    }),
  );
  return candidates.filter((candidate): candidate is OpenCandidate => Boolean(candidate));
}

async function mapDashboardRepos<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

function matchesPullQuery(
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

function matchesClosedRange(completedIso: string, range: DashboardClosedRange): boolean {
  if (range === "all") {
    return true;
  }
  const days = range === "1d" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return Date.now() - new Date(completedIso).getTime() <= days * DAY_MS;
}
