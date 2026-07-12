import { Injectable } from "@nestjs/common";

export type ActivityDay = { date: string; count: number };
import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import { fetchPublicContributions } from "../../infrastructure/github/github-contributions.js";
import { pullLineCounts, relativeTime } from "./dashboard-pull-details.js";
import { listDashboardPulls } from "./dashboard-pull-list.js";
import { resolveDashboardPullStatus } from "./dashboard-review-status.js";
import {
  COMPLETED_PULL_LIMIT,
  completedCandidate,
  completedPulls,
} from "./dashboard-completed-pull-window.js";
import {
  getDashboardOpenPullPagesForUser,
  getDashboardPullPageForUser,
} from "./dashboard-pull-page.js";
import {
  getDashboardOpenPullPagesFromIndex,
  getDashboardPullPageFromIndex,
} from "./dashboard-index-pull-page.js";
import { getDashboardSummaryForUser } from "./dashboard-summary.js";
import type {
  CompletedCandidate,
  DashboardOpenPullPageQuery,
  DashboardPullPageQuery,
  GitHubPullSummary,
} from "./dashboard-pull-page-types.js";
import type { ReviewAnalysisStatus } from "../review/review-lifecycle.js";
import {
  type DashboardWorkspaceScope,
  type DashboardWorkspaceScopeOptions,
  type DashboardResolvedRepositoryBatchAuthorizer,
  loadDashboardWorkspaceScope,
} from "./dashboard-workspace-scope.js";
import { config } from "../../config.js";
import { dashboardScopeForRepository } from "./dashboard-repository-scope.js";

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
export type DashboardCompletedState = "open" | "draft" | "merged" | "closed";

type DashboardPullBase = Record<"id" | "org" | "repo" | "title" | "author", string> & {
  number: number;
  additions: number;
  deletions: number;
  changedFiles: number;
};

export type DashboardPull = DashboardPullBase &
  Record<"updatedAt" | "updatedAtIso" | "headBranch" | "baseBranch", string> & {
    headSha: string;
    githubStatus: DashboardCompletedState;
    analysisStatus: ReviewAnalysisStatus;
    completedAt: string | null;
    status: DashboardReviewStatus;
    chapterCount: number;
    viewedChapters: number;
    risk: DashboardRisk;
  };

export type DashboardCompletedPull = DashboardPullBase & {
  completedAt: string;
  completedState: DashboardCompletedState;
  analysisStatus: "complete";
  githubStatus: DashboardCompletedState;
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
  repoAccess?: { filterReadableResolvedRepositories: DashboardResolvedRepositoryBatchAuthorizer };
  workspaceScopeLoader?: (
    userId: string,
    userLogin: string,
    filterReadableRepositories: DashboardResolvedRepositoryBatchAuthorizer,
    options?: DashboardWorkspaceScopeOptions,
  ) => Promise<DashboardWorkspaceScope | null>;
}

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
          openPrs = await listDashboardPulls(octokit, repo.owner, repo.name, "open");
        } catch {
          repos.push(this.repoPayload(repo, 0, true));
          continue;
        }

        let closedPrs: GitHubPullSummary[] = [];
        try {
          closedPrs = await listDashboardPulls(octokit, repo.owner, repo.name, "closed");
        } catch {
          closedPrs = [];
        }

        repos.push(this.repoPayload(repo, openPrs.length, true));

        for (const pr of openPrs) {
          const lineCounts = await pullLineCounts(octokit, repo.owner, repo.name, pr.number);
          const status = await resolveDashboardPullStatus(
            user.id,
            repo.id,
            repo.fullName,
            pr.number,
            pr.head.sha ?? "",
          );
          pulls.push({
            id: `${repo.owner}-${repo.name}-${pr.number}`,
            org: repo.owner,
            repo: repo.name,
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? "unknown",
            updatedAt: relativeTime(pr.updated_at),
            updatedAtIso: pr.updated_at,
            headBranch: pr.head.ref,
            headSha: pr.head.sha ?? "",
            baseBranch: pr.base.ref,
            githubStatus: pr.merged_at ? "merged" : pr.draft ? "draft" : (pr.state ?? "open"),
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
    const scope = dashboardScopeForRepository(
      await this.loadWorkspaceScope(user, {
        boardRead: true,
        indexRead: config.DASHBOARD_READ_FROM_INDEX,
      }),
      input.repository,
    );
    if (config.DASHBOARD_READ_FROM_INDEX) {
      return getDashboardPullPageFromIndex(user, input, scope);
    }
    return getDashboardPullPageForUser(
      user,
      input,
      {
        octokitFactory: this.deps.octokitFactory,
        listPulls: listDashboardPulls,
        resolveStatus: resolveDashboardPullStatus,
      },
      scope,
    );
  }

  async getOpenPullPagesForUser(
    user: { id: string; login: string },
    input: DashboardOpenPullPageQuery,
  ) {
    const scope = dashboardScopeForRepository(
      await this.loadWorkspaceScope(user, {
        boardRead: true,
        indexRead: config.DASHBOARD_READ_FROM_INDEX,
      }),
      input.repository,
    );
    if (config.DASHBOARD_READ_FROM_INDEX) {
      return getDashboardOpenPullPagesFromIndex(user, input, scope);
    }
    return getDashboardOpenPullPagesForUser(
      user,
      input,
      {
        octokitFactory: this.deps.octokitFactory,
        listPulls: listDashboardPulls,
        resolveStatus: resolveDashboardPullStatus,
      },
      scope,
    );
  }

  private loadWorkspaceScope(
    user: {
      id: string;
      login: string;
    },
    options?: DashboardWorkspaceScopeOptions,
  ): Promise<DashboardWorkspaceScope | null> {
    const filterReadableRepositories: DashboardResolvedRepositoryBatchAuthorizer = (input) =>
      this.deps.repoAccess?.filterReadableResolvedRepositories(input) ?? Promise.resolve([]);
    return (this.deps.workspaceScopeLoader ?? loadDashboardWorkspaceScope)(
      user.id,
      user.login,
      filterReadableRepositories,
      options,
    );
  }

  private repoPayload(
    repo: { id: string; fullName: string },
    openPrCount: number,
    folioEnabled: boolean,
  ): DashboardRepo {
    return { id: repo.id, fullName: repo.fullName, openPrCount, folioEnabled };
  }
}
