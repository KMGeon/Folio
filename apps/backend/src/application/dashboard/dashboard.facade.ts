import { Injectable } from "@nestjs/common";
import {
  chaptersRepo,
  installationsRepo,
  pullRequestsRepo,
  repositoriesRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";

export type ActivityDay = { date: string; count: number };
import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import { fetchPublicContributions } from "../../infrastructure/github/github-contributions.js";

export type DashboardReviewStatus = "ready" | "processing";
export type DashboardRisk = "low" | "medium" | "high";
export type DashboardCompletedState = "merged" | "closed";

type DashboardPullBase = Record<"id" | "org" | "repo" | "title" | "author", string> & {
  number: number;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export type DashboardPull = DashboardPullBase &
  Record<"updatedAt" | "headBranch" | "baseBranch", string> & {
    status: DashboardReviewStatus;
    chapterCount: number;
    viewedChapters: number;
    risk: DashboardRisk;
  };

export type DashboardCompletedPull = DashboardPullBase & {
  completedAt: string;
  completedState: DashboardCompletedState;
};

export type DashboardRepo = Record<"id" | "fullName", string> & {
  openPrCount: number;
  folioEnabled: boolean;
};

export interface DashboardPayload {
  metrics: Record<"ready" | "processing" | "installedRepos" | "activeRepos" | "completed", number>;
  repos: DashboardRepo[];
  pulls: DashboardPull[];
  completedPulls: DashboardCompletedPull[];
  activity: ActivityDay[];
}

export interface DashboardDeps {
  octokitFactory?: (githubInstallationId: number) => Promise<Octokit>;
}

type PullStatus = Record<"chapterCount" | "viewedChapters" | "changedFiles", number> & {
  status: DashboardReviewStatus;
};

type PullLineCounts = Record<"additions" | "deletions" | "changedFiles", number>;

type GitHubPullSummary = Record<"title" | "updated_at", string> & {
  number: number;
  user?: { login?: string } | null;
  head: { ref: string };
  base: { ref: string };
  closed_at?: string | null;
  merged_at?: string | null;
};

type CompletedCandidate = Record<"owner" | "repo" | "title" | "author" | "completedIso", string> & {
  octokit: Octokit;
  number: number;
  completedState: DashboardCompletedState;
};

const PROCESSING: PullStatus = {
  status: "processing",
  chapterCount: 0,
  viewedChapters: 0,
  changedFiles: 0,
};

const EMPTY_LINE_COUNTS: PullLineCounts = {
  additions: 0,
  deletions: 0,
  changedFiles: 0,
};
const COMPLETED_PULL_LIMIT = 20;

@Injectable()
export class DashboardFacade {
  constructor(private readonly deps: DashboardDeps = {}) {}

  /** Live open PRs across the user's installed repos, merged with DB review state. */
  async getForUser(user: { id: string; login: string }): Promise<DashboardPayload> {
    const makeOctokit = this.deps.octokitFactory ?? createInstallationOctokit;
    const installations = await installationsRepo.listByAccountLogin(user.login);

    const repos: DashboardRepo[] = [];
    const pulls: DashboardPull[] = [];
    const completedCandidates: CompletedCandidate[] = [];

    for (const installation of installations) {
      const repoRows = await repositoriesRepo.listByInstallation(installation.id);
      if (repoRows.length === 0) {
        continue;
      }

      const enabledRepoRows: typeof repoRows = [];
      for (const repo of repoRows) {
        if (repo.folioEnabled) {
          enabledRepoRows.push(repo);
          continue;
        }

        repos.push(this.repoPayload(repo, 0, false));
      }

      if (enabledRepoRows.length === 0) {
        continue;
      }

      let octokit: Octokit;
      try {
        octokit = await makeOctokit(installation.githubInstallationId);
      } catch {
        // Stale/deleted installation can't mint a token — its repos are unreachable.
        continue;
      }

      for (const repo of enabledRepoRows) {
        let openPrs: GitHubPullSummary[];
        try {
          openPrs = await this.listPulls(octokit, repo.owner, repo.name, "open");
        } catch {
          repos.push(this.repoPayload(repo, 0, true));
          continue;
        }

        let closedPrs: GitHubPullSummary[] = [];
        try {
          closedPrs = await this.listPulls(octokit, repo.owner, repo.name, "closed");
        } catch {
          closedPrs = [];
        }

        repos.push(this.repoPayload(repo, openPrs.length, true));

        for (const pr of openPrs) {
          const lineCounts = await this.pullLineCounts(octokit, repo.owner, repo.name, pr.number);
          const status = await this.resolveStatus(user.id, repo.id, pr.number);
          pulls.push({
            id: `${repo.owner}-${repo.name}-${pr.number}`,
            org: repo.owner,
            repo: repo.name,
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? "unknown",
            updatedAt: relativeTime(pr.updated_at),
            headBranch: pr.head.ref,
            baseBranch: pr.base.ref,
            risk: "low",
            ...lineCounts,
            ...status,
          });
        }

        for (const pr of closedPrs) {
          const candidate = this.completedCandidate(octokit, repo.owner, repo.name, pr);
          if (candidate) {
            completedCandidates.push(candidate);
          }
        }
      }
    }

    const ready = pulls.filter((p) => p.status === "ready").length;
    const completedPulls = await this.completedPulls(completedCandidates);
    // Activity heatmap is the user's PUBLIC GitHub contributions, not Folio data.
    const activity = await fetchPublicContributions(user.login);
    return {
      metrics: {
        ready,
        processing: pulls.length - ready,
        installedRepos: repos.length,
        activeRepos: repos.filter((repo) => repo.folioEnabled).length,
        completed: completedPulls.length,
      },
      repos,
      pulls,
      completedPulls,
      activity,
    };
  }

  private repoPayload(
    repo: { id: string; fullName: string },
    openPrCount: number,
    folioEnabled: boolean,
  ): DashboardRepo {
    return { id: repo.id, fullName: repo.fullName, openPrCount, folioEnabled };
  }

  private async listPulls(
    octokit: Octokit,
    owner: string,
    repo: string,
    state: "open" | "closed",
  ): Promise<GitHubPullSummary[]> {
    if (state === "closed") {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state,
        sort: "updated",
        direction: "desc",
        per_page: COMPLETED_PULL_LIMIT,
      });
      return data as GitHubPullSummary[];
    }

    return (await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state,
      per_page: 100,
    })) as GitHubPullSummary[];
  }

  private async resolveStatus(
    userId: string,
    repoId: string,
    prNumber: number,
  ): Promise<PullStatus> {
    const pr = await pullRequestsRepo.getByRepoAndNumber(repoId, prNumber);
    if (!pr) {
      return PROCESSING;
    }
    const revision = await revisionsRepo.latestForPr(pr.id);
    if (!revision) {
      return PROCESSING;
    }
    const chapterRows = await chaptersRepo.listByRevision(revision.id);
    if (chapterRows.length === 0) {
      return PROCESSING;
    }
    const { viewed } = await reviewStateRepo.progressForRevision(userId, revision.id);
    const changedFiles = new Set(chapterRows.flatMap((c) => c.hunkRefs.map((h) => h.filePath)))
      .size;
    return {
      status: "ready",
      chapterCount: chapterRows.length,
      viewedChapters: viewed,
      changedFiles,
    };
  }

  private async pullLineCounts(
    octokit: Octokit,
    owner: string,
    repo: string,
    pullNumber: number,
  ): Promise<PullLineCounts> {
    try {
      const { data } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
      return {
        additions: data.additions ?? 0,
        deletions: data.deletions ?? 0,
        changedFiles: data.changed_files ?? 0,
      };
    } catch {
      return EMPTY_LINE_COUNTS;
    }
  }

  private completedCandidate(
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

  private async completedPulls(
    candidates: CompletedCandidate[],
  ): Promise<DashboardCompletedPull[]> {
    const pulls: DashboardCompletedPull[] = [];
    for (const candidate of candidates
      .sort((a, b) => new Date(b.completedIso).getTime() - new Date(a.completedIso).getTime())
      .slice(0, COMPLETED_PULL_LIMIT)) {
      const lineCounts = await this.pullLineCounts(
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
}

function relativeTime(iso: string): string {
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
