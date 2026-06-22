import { Injectable } from "@nestjs/common";
import {
  chaptersRepo,
  installationsRepo,
  pullRequestsRepo,
  repositoriesRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";

export interface ActivityDay {
  date: string;
  count: number;
}
import { createInstallationOctokit } from "@folio/github";
import type { Octokit } from "octokit";
import { fetchPublicContributions } from "../../infrastructure/github/github-contributions.js";

export type DashboardReviewStatus = "ready" | "processing";
export type DashboardRisk = "low" | "medium" | "high";

export interface DashboardPull {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  headBranch: string;
  baseBranch: string;
  status: DashboardReviewStatus;
  chapterCount: number;
  viewedChapters: number;
  changedFiles: number;
  risk: DashboardRisk;
}

export interface DashboardRepo {
  id: string;
  fullName: string;
  openPrCount: number;
  folioEnabled: boolean;
}

export interface DashboardPayload {
  metrics: { ready: number; processing: number; installedRepos: number; activeRepos: number };
  repos: DashboardRepo[];
  pulls: DashboardPull[];
  /** Per-day chapter-view counts for the activity heatmap (days with activity only). */
  activity: ActivityDay[];
}

export interface DashboardDeps {
  octokitFactory?: (githubInstallationId: number) => Promise<Octokit>;
}

interface PullStatus {
  status: DashboardReviewStatus;
  chapterCount: number;
  viewedChapters: number;
  changedFiles: number;
}

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
    const installations = await installationsRepo.listByAccountLogin(user.login);

    const repos: DashboardRepo[] = [];
    const pulls: DashboardPull[] = [];

    for (const installation of installations) {
      const repoRows = await repositoriesRepo.listByInstallation(installation.id);
      if (repoRows.length === 0) {
        continue;
      }

      let octokit: Octokit;
      try {
        octokit = await makeOctokit(installation.githubInstallationId);
      } catch {
        // Stale/deleted installation can't mint a token — its repos are unreachable.
        continue;
      }

      for (const repo of repoRows) {
        if (!repo.folioEnabled) {
          repos.push({
            id: repo.id,
            fullName: repo.fullName,
            openPrCount: 0,
            folioEnabled: false,
          });
          continue;
        }

        let openPrs: Awaited<ReturnType<Octokit["paginate"]>>;
        try {
          openPrs = await octokit.paginate(octokit.rest.pulls.list, {
            owner: repo.owner,
            repo: repo.name,
            state: "open",
            per_page: 100,
          });
        } catch {
          repos.push({
            id: repo.id,
            fullName: repo.fullName,
            openPrCount: 0,
            folioEnabled: true,
          });
          continue;
        }

        repos.push({
          id: repo.id,
          fullName: repo.fullName,
          openPrCount: openPrs.length,
          folioEnabled: true,
        });

        for (const pr of openPrs) {
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
            ...status,
          });
        }
      }
    }

    const ready = pulls.filter((p) => p.status === "ready").length;
    // Activity heatmap is the user's PUBLIC GitHub contributions, not Folio data.
    const activity = await fetchPublicContributions(user.login);
    return {
      metrics: {
        ready,
        processing: pulls.length - ready,
        installedRepos: repos.length,
        activeRepos: repos.filter((repo) => repo.folioEnabled).length,
      },
      repos,
      pulls,
      activity,
    };
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

function relativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) {
    return "방금";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  return `${Math.floor(hours / 24)}일 전`;
}
