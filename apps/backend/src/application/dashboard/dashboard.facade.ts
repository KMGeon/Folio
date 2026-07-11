import { Injectable } from "@nestjs/common";
import { chaptersRepo, pullRequestsRepo, reviewStateRepo, revisionsRepo } from "@folio/db";

export type ActivityDay = { date: string; count: number };
import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import type { RepoAccessService } from "../../domain/auth/repo-access.service.js";
import { fetchPublicContributions } from "../../infrastructure/github/github-contributions.js";
import { pullLineCounts, relativeTime } from "./dashboard-pull-details.js";
import {
  DASHBOARD_CLOSED_PULL_LIST_TTL_MS,
  DASHBOARD_OPEN_PULL_LIST_TTL_MS,
  cachedDashboardGithubRequest,
} from "./dashboard-github-cache.js";
import {
  COMPLETED_PULL_LIMIT,
  completedCandidate,
  completedPulls,
} from "./dashboard-completed-pull-window.js";
import {
  getDashboardOpenPullPagesForUser,
  getDashboardPullPageForUser,
} from "./dashboard-pull-page.js";
import { getDashboardSummaryForUser } from "./dashboard-summary.js";
import type {
  CompletedCandidate,
  DashboardDirection,
  DashboardOpenPullPageQuery,
  DashboardPullPageQuery,
  GitHubPullSummary,
} from "./dashboard-pull-page-types.js";
import {
  type DashboardWorkspaceScope,
  type DashboardRepositoryReadAuthorizer,
  loadDashboardWorkspaceScope,
} from "./dashboard-workspace-scope.js";

export type {
  DashboardBucket,
  DashboardClosedRange,
  DashboardDirection,
  DashboardOpenBucket,
  DashboardOpenPullPageQuery,
  DashboardOpenPullPages,
  DashboardOrdering,
  DashboardPullPage,
  DashboardPullPageQuery,
  DashboardSummaryPayload,
} from "./dashboard-pull-page-types.js";

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
  repoAccess?: Pick<RepoAccessService, "assertLevelAtLeast">;
  workspaceScopeLoader?: (
    userId: string,
    userLogin: string,
    canReadRepository: DashboardRepositoryReadAuthorizer,
  ) => Promise<DashboardWorkspaceScope | null>;
}

type PullStatus = Record<"chapterCount" | "viewedChapters" | "changedFiles", number> & {
  status: DashboardReviewStatus;
};

const PROCESSING: PullStatus = {
  status: "processing",
  chapterCount: 0,
  viewedChapters: 0,
  changedFiles: 0,
};

@Injectable()
export class DashboardFacade {
  constructor(private readonly deps: DashboardDeps = {}) {}

  /** Live open PRs across the user's installed repos, merged with DB review state. */
  async getForUser(user: { id: string; login: string }): Promise<DashboardPayload> {
    const makeOctokit = this.deps.octokitFactory ?? createInstallationOctokit;
    const scope = await this.loadWorkspaceScope(user);

    const repos: DashboardRepo[] = [];
    const pulls: DashboardPull[] = [];
    const completedCandidates: CompletedCandidate[] = [];

    for (const installation of scope?.installations ?? []) {
      const repoRows =
        scope?.repositories.filter((repository) => repository.installationId === installation.id) ??
        [];
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
          const lineCounts = await pullLineCounts(octokit, repo.owner, repo.name, pr.number);
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
          const candidate = completedCandidate(octokit, repo.owner, repo.name, pr);
          if (candidate) {
            completedCandidates.push(candidate);
          }
        }
      }
    }

    const ready = pulls.filter((p) => p.status === "ready").length;
    const completedPullsPayload = await completedPulls(
      completedCandidates
        .sort((a, b) => new Date(b.completedIso).getTime() - new Date(a.completedIso).getTime())
        .slice(0, COMPLETED_PULL_LIMIT),
    );
    // Activity heatmap is the user's PUBLIC GitHub contributions, not Folio data.
    const activity = await fetchPublicContributions(user.login);
    return {
      metrics: {
        ready,
        processing: pulls.length - ready,
        installedRepos: repos.length,
        activeRepos: repos.filter((repo) => repo.folioEnabled).length,
        completed: completedPullsPayload.length,
      },
      repos,
      pulls,
      completedPulls: completedPullsPayload,
      activity,
    };
  }

  async getSummaryForUser(user: { id: string; login: string }) {
    return getDashboardSummaryForUser(user, await this.loadWorkspaceScope(user));
  }

  async getPullPageForUser(user: { id: string; login: string }, input: DashboardPullPageQuery) {
    return getDashboardPullPageForUser(
      user,
      input,
      {
        octokitFactory: this.deps.octokitFactory,
        listPulls: this.listPulls.bind(this),
        resolveStatus: this.resolveStatus.bind(this),
      },
      await this.loadWorkspaceScope(user),
    );
  }

  async getOpenPullPagesForUser(
    user: { id: string; login: string },
    input: DashboardOpenPullPageQuery,
  ) {
    return getDashboardOpenPullPagesForUser(
      user,
      input,
      {
        octokitFactory: this.deps.octokitFactory,
        listPulls: this.listPulls.bind(this),
        resolveStatus: this.resolveStatus.bind(this),
      },
      await this.loadWorkspaceScope(user),
    );
  }

  private loadWorkspaceScope(user: {
    id: string;
    login: string;
  }): Promise<DashboardWorkspaceScope | null> {
    const canReadRepository: DashboardRepositoryReadAuthorizer = (input) =>
      this.deps.repoAccess?.assertLevelAtLeast(input, "read") ?? Promise.resolve(false);
    return (this.deps.workspaceScopeLoader ?? loadDashboardWorkspaceScope)(
      user.id,
      user.login,
      canReadRepository,
    );
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
    page?: number,
    direction?: DashboardDirection,
  ): Promise<GitHubPullSummary[]> {
    const cacheKey = `pulls:list:${owner}/${repo}:${state}:${page ?? 1}:${direction ?? "desc"}`;
    const ttlMs =
      state === "closed" ? DASHBOARD_CLOSED_PULL_LIST_TTL_MS : DASHBOARD_OPEN_PULL_LIST_TTL_MS;
    return cachedDashboardGithubRequest(cacheKey, ttlMs, async () => {
      if (state === "closed") {
        const { data } = await octokit.rest.pulls.list({
          owner,
          repo,
          state,
          sort: "updated",
          direction: direction ?? "desc",
          per_page: COMPLETED_PULL_LIMIT,
          ...(page ? { page } : {}),
        });
        return data as GitHubPullSummary[];
      }

      return (await octokit.paginate(octokit.rest.pulls.list, {
        owner,
        repo,
        state,
        per_page: 100,
      })) as GitHubPullSummary[];
    });
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
}
