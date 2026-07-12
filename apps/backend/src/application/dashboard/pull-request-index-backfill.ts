import {
  JOB_KIND,
  PR_INDEX_STATUS,
  dedupeKeyFor,
  enqueueJobWithOutcome,
  installationsRepo,
  pullRequestIndexRepo,
  repositoriesRepo,
} from "@folio/db";
import { createInstallationOctokit } from "@folio/github";
import { Inject, Injectable } from "@nestjs/common";
import type { Octokit } from "octokit";
import { BoardEventHub } from "./board-event-hub.js";
import { PullRequestIndexWriter } from "./pull-request-index-writer.js";

const CLOSED_RETENTION_DAYS = 97;
const CLOSED_PAGE_SIZE = 50;
const MAX_CLOSED_PAGES = 4;

export type BackfillDeps = {
  octokitFactory?: (githubInstallationId: number) => Promise<Octokit>;
};

@Injectable()
export class PullRequestIndexBackfill {
  constructor(
    @Inject(PullRequestIndexWriter) private readonly writer: PullRequestIndexWriter,
    @Inject(BoardEventHub) private readonly hub: BoardEventHub,
    private readonly deps: BackfillDeps = {},
  ) {}

  async enqueueForRepository(repositoryId: string): Promise<void> {
    await enqueueJobWithOutcome({
      kind: JOB_KIND.PR_INDEX_BACKFILL,
      payload: { kind: JOB_KIND.PR_INDEX_BACKFILL, repositoryId },
      dedupeKey: dedupeKeyFor(repositoryId, "latest", JOB_KIND.PR_INDEX_BACKFILL),
    });
  }

  async runForRepository(repositoryId: string): Promise<void> {
    const repo = await repositoriesRepo.getById(repositoryId);
    if (!repo || !repo.folioEnabled || !repo.githubAccessActive) {
      return;
    }

    await repositoriesRepo.setPrIndexStatus(repositoryId, PR_INDEX_STATUS.BACKFILLING);

    try {
      const installation = await installationsRepo.getById(repo.installationId);
      if (!installation || installation.suspendedAt) {
        throw new Error(`installation missing or suspended for repo ${repo.fullName}`);
      }

      const makeOctokit = this.deps.octokitFactory ?? createInstallationOctokit;
      const octokit = await makeOctokit(installation.githubInstallationId);

      const openPulls = (await octokit.paginate(octokit.rest.pulls.list, {
        owner: repo.owner,
        repo: repo.name,
        state: "open",
        per_page: 100,
      })) as Parameters<PullRequestIndexWriter["applyPull"]>[0]["pull"][];

      for (const pull of openPulls) {
        await this.writer.applyPull({
          repoId: repo.id,
          owner: repo.owner,
          repo: repo.name,
          pull,
        });
      }

      // Recent closed window for completed column (bounded pages, not all history).
      for (let page = 1; page <= MAX_CLOSED_PAGES; page += 1) {
        const { data } = await octokit.rest.pulls.list({
          owner: repo.owner,
          repo: repo.name,
          state: "closed",
          sort: "updated",
          direction: "desc",
          per_page: CLOSED_PAGE_SIZE,
          page,
        });
        if (data.length === 0) {
          break;
        }
        let hitOld = false;
        for (const pull of data) {
          const stamp = pull.merged_at ?? pull.closed_at ?? pull.updated_at;
          if (
            stamp &&
            Date.now() - new Date(stamp).getTime() > CLOSED_RETENTION_DAYS * 24 * 60 * 60 * 1000
          ) {
            hitOld = true;
            continue;
          }
          await this.writer.applyPull({
            repoId: repo.id,
            owner: repo.owner,
            repo: repo.name,
            pull,
          });
        }
        if (hitOld || data.length < CLOSED_PAGE_SIZE) {
          break;
        }
      }

      const cutoff = new Date(Date.now() - CLOSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await pullRequestIndexRepo.pruneClosedOlderThan(cutoff);

      await repositoriesRepo.setPrIndexStatus(repositoryId, PR_INDEX_STATUS.READY, {
        backfilledAt: new Date(),
      });
      this.hub.publish({
        type: "board.invalidate",
        reason: "backfill_complete",
        repoId: repositoryId,
      });
    } catch (error) {
      await repositoriesRepo.setPrIndexStatus(repositoryId, PR_INDEX_STATUS.ERROR);
      throw error;
    }
  }
}
