import { installationsRepo, repositoriesRepo } from "@folio/db";
import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import { pullLineCounts, relativeTime } from "./dashboard-pull-details.js";
import type {
  DashboardCompletedPull,
  DashboardPull,
  DashboardReviewStatus,
} from "./dashboard.facade.js";
import type {
  CompletedCandidate,
  DashboardBucket,
  DashboardClosedRange,
  DashboardPullPage,
  DashboardPullPageQuery,
  GitHubPullSummary,
} from "./dashboard-pull-page-types.js";

type PullStatus = Record<"chapterCount" | "viewedChapters" | "changedFiles", number> & {
  status: DashboardReviewStatus;
};
type OpenCandidate = { octokit: Octokit; repo: RepoRow; pr: GitHubPullSummary; status: PullStatus };
type RepoRow = { id: string; owner: string; name: string; fullName: string; folioEnabled: boolean };
type NormalizedQuery = Required<Omit<DashboardPullPageQuery, "cursor" | "q">> & {
  cursor?: string;
  q?: string;
};
type PullPageDeps = {
  octokitFactory?: (githubInstallationId: number) => Promise<Octokit>;
  listPulls: (
    octokit: Octokit,
    owner: string,
    repo: string,
    state: "open" | "closed",
  ) => Promise<GitHubPullSummary[]>;
  resolveStatus: (userId: string, repoId: string, prNumber: number) => Promise<PullStatus>;
};

export const COMPLETED_PULL_LIMIT = 20;
const DEFAULT_PULL_PAGE_LIMIT = 20;
const MAX_PULL_PAGE_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function getDashboardPullPageForUser(
  user: { id: string; login: string },
  input: DashboardPullPageQuery,
  deps: PullPageDeps,
): Promise<DashboardPullPage> {
  const query = normalizeQuery(input);
  const offset = decodeCursor(query.cursor);
  const makeOctokit = deps.octokitFactory ?? createInstallationOctokit;
  const openCandidates: OpenCandidate[] = [];
  const completedCandidates: CompletedCandidate[] = [];

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

    for (const repo of repoRows) {
      let pulls: GitHubPullSummary[];
      try {
        pulls = await deps.listPulls(
          octokit,
          repo.owner,
          repo.name,
          query.bucket === "completed" ? "closed" : "open",
        );
      } catch {
        continue;
      }

      for (const pr of pulls) {
        if (query.bucket === "completed") {
          const candidate = completedCandidate(octokit, repo.owner, repo.name, pr);
          if (
            candidate &&
            matchesClosedRange(candidate.completedIso, query.closedRange) &&
            matchesPullQuery(query.q, repo.name, pr.number, pr.title, pr.user?.login)
          ) {
            completedCandidates.push(candidate);
          }
          continue;
        }

        if (!query.showDrafts && pr.draft === true) {
          continue;
        }
        if (!matchesPullQuery(query.q, repo.name, pr.number, pr.title, pr.user?.login)) {
          continue;
        }
        const status = await deps.resolveStatus(user.id, repo.id, pr.number);
        if (matchesOpenBucket(query.bucket, user.login, pr.user?.login, status.status)) {
          openCandidates.push({ octokit, repo, pr, status });
        }
      }
    }
  }

  if (query.bucket === "completed") {
    return query.ordering === "lines"
      ? pageByLines(await completedPulls(completedCandidates), offset, query)
      : pageCompleted(completedCandidates, offset, query);
  }
  return query.ordering === "lines"
    ? pageByLines(await openPulls(openCandidates), offset, query)
    : pageOpen(openCandidates, offset, query);
}

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

async function pageCompleted(
  candidates: CompletedCandidate[],
  offset: number,
  query: NormalizedQuery,
): Promise<DashboardPullPage> {
  const sorted = candidates.sort((a, b) => dateDelta(a.completedIso, b.completedIso, query));
  return page(
    await completedPulls(sorted.slice(offset, offset + query.limit)),
    offset,
    sorted.length,
  );
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

function decodeCursor(cursor: string | undefined): number {
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

function matchesOpenBucket(
  bucket: DashboardBucket,
  userLogin: string,
  authorLogin: string | undefined,
  status: DashboardReviewStatus,
): boolean {
  return (
    (bucket === "yours" && authorLogin === userLogin) ||
    (bucket === "ready" && authorLogin !== userLogin && status === "ready") ||
    (bucket === "other" && authorLogin !== userLogin && status !== "ready")
  );
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
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return Date.now() - new Date(completedIso).getTime() <= days * DAY_MS;
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
