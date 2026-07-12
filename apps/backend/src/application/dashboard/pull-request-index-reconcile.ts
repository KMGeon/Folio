import { installationsRepo, pullRequestIndexRepo, repositoriesRepo } from "@folio/db";
import { createInstallationOctokit } from "@folio/github";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { Octokit } from "octokit";
import { BoardEventHub } from "./board-event-hub.js";
import { PullRequestIndexWriter } from "./pull-request-index-writer.js";

const CLOSED_RETENTION_DAYS = 97;

export type ReconcileDeps = {
  octokitFactory?: (githubInstallationId: number) => Promise<Octokit>;
};

export type ReconcileResult = { upserted: number; closed: number };

@Injectable()
export class PullRequestIndexReconcile {
  private readonly logger = new Logger(PullRequestIndexReconcile.name);

  constructor(
    @Inject(PullRequestIndexWriter) private readonly writer: PullRequestIndexWriter,
    @Inject(BoardEventHub) private readonly hub: BoardEventHub,
    private readonly deps: ReconcileDeps = {},
  ) {}

  async runForRepository(repositoryId: string): Promise<ReconcileResult> {
    const repo = await repositoriesRepo.getById(repositoryId);
    if (!repo || !repo.folioEnabled || !repo.githubAccessActive) {
      return { upserted: 0, closed: 0 };
    }

    const installation = await installationsRepo.getById(repo.installationId);
    if (!installation || installation.suspendedAt) {
      throw new Error(`installation missing or suspended for repo ${repo.fullName}`);
    }

    const makeOctokit = this.deps.octokitFactory ?? createInstallationOctokit;
    const octokit = await makeOctokit(installation.githubInstallationId);
    const githubPulls = (await octokit.paginate(octokit.rest.pulls.list, {
      owner: repo.owner,
      repo: repo.name,
      state: "open",
      per_page: 100,
    })) as Parameters<PullRequestIndexWriter["applyPull"]>[0]["pull"][];
    const indexPulls = await pullRequestIndexRepo.listOpenByRepoIds([repo.id]);
    const githubByNumber = new Map(githubPulls.map((pull) => [pull.number, pull]));
    const indexNumbers = new Set(indexPulls.map((pull) => pull.githubPrNumber));

    let upserted = 0;
    for (const pull of githubPulls) {
      if (indexNumbers.has(pull.number)) {
        continue;
      }
      await this.writer.applyPull({ repoId: repo.id, owner: repo.owner, repo: repo.name, pull });
      upserted += 1;
    }

    let closed = 0;
    for (const pull of indexPulls) {
      if (githubByNumber.has(pull.githubPrNumber)) {
        continue;
      }
      // A missing open is removed immediately; GitHub webhooks/recent backfill retain true closes.
      await pullRequestIndexRepo.deleteByRepoAndNumber(repo.id, pull.githubPrNumber);
      closed += 1;
    }

    const cutoff = new Date(Date.now() - CLOSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    await pullRequestIndexRepo.pruneClosedOlderThan(cutoff);

    if (upserted > 0 || closed > 0) {
      this.hub.publish({
        type: "board.invalidate",
        reason: "reconcile",
        repoId: repositoryId,
      });
    }
    return { upserted, closed };
  }

  async runRound(input: { limitRepos: number }): Promise<{
    attempted: number;
    failed: number;
    upserted: number;
    closed: number;
  }> {
    const repos = (await repositoriesRepo.listFolioEnabledWithGithubAccess()).slice(
      0,
      input.limitRepos,
    );
    let failed = 0;
    let upserted = 0;
    let closed = 0;

    // Sequential reconciliation bounds GitHub request concurrency per worker.
    for (const repo of repos) {
      try {
        const result = await this.runForRepository(repo.id);
        upserted += result.upserted;
        closed += result.closed;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`reconcile failed for repository ${repo.id}: ${message}`);
      }
    }

    return { attempted: repos.length, failed, upserted, closed };
  }
}
