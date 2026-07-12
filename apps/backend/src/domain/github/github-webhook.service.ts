import { Inject, Injectable, Optional } from "@nestjs/common";
import { repositoriesRepo } from "@folio/db";
import { createInstallationOctokit, createIssueReaction } from "@folio/github";
import type { AccountType } from "@folio/types";
import { PullRequestIndexWriter } from "../../application/dashboard/pull-request-index-writer.js";
import { InstallationSyncFacade } from "../../application/github/installation-sync.facade.js";
import { config } from "../../config.js";
import { GitHubWebhookAdapter } from "../../infrastructure/github/github-webhook.adapter.js";
import { ReviewJobQueue } from "../../infrastructure/persistence/review-job-queue.js";
import { LOGGER_PORT } from "../../internal/logger/logger.port.js";
import type { LoggerPort } from "../../internal/logger/logger.port.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import type { GitHubWebhookCommand, GitHubWebhookResult } from "./github-webhook.model.js";

// pull_request actions that change the diff worth re-decomposing.
const REVIEWABLE_PR_ACTIONS = new Set(["opened", "synchronize", "reopened", "ready_for_review"]);
// Board index tracks meta changes even when decomposition is unnecessary.
const INDEX_PR_ACTIONS = new Set([
  "opened",
  "synchronize",
  "reopened",
  "ready_for_review",
  "converted_to_draft",
  "edited",
  "closed",
  "labeled",
  "unlabeled",
]);
// installation actions that (re)grant access and warrant a repository sync.
const INSTALL_SYNC_ACTIONS = new Set(["created", "new_permissions_accepted", "unsuspend"]);
const INSTALL_DISCONNECT_ACTIONS = new Set(["suspend", "deleted"]);

@Injectable()
export class GitHubWebhookService {
  constructor(
    @Inject(GitHubWebhookAdapter) private readonly gitHubWebhookAdapter: GitHubWebhookAdapter,
    @Inject(ReviewJobQueue) private readonly reviewJobQueue: ReviewJobQueue,
    @Inject(InstallationSyncFacade) private readonly installationSync: InstallationSyncFacade,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
    @Optional()
    @Inject(PullRequestIndexWriter)
    private readonly indexWriter?: PullRequestIndexWriter,
  ) {}

  async accept(command: GitHubWebhookCommand): Promise<GitHubWebhookResult> {
    const { deliveryId, eventName, signature } = command.headers;

    if (!deliveryId || !eventName) {
      throw new CoreException(ErrorType.MissingGitHubHeaders);
    }

    const isValid = this.gitHubWebhookAdapter.verifySignature({
      rawBody: command.rawBody,
      signature,
      secret: config.GITHUB_APP_WEBHOOK_SECRET ?? "",
    });

    if (!isValid) {
      throw new CoreException(ErrorType.InvalidSignature);
    }

    const event = this.gitHubWebhookAdapter.parseEvent({
      eventName,
      rawBody: command.rawBody,
    });

    if (!event) {
      this.logger.info("[folio] ignored GitHub webhook", {
        deliveryId,
        event: eventName,
      });
      return { received: true, deliveryId, event: eventName, ignored: true };
    }

    const installationId = event.payload.installation?.id;
    const repository = event.payload.repository?.full_name;
    const pullNumber =
      event.name === "pull_request"
        ? event.payload.pull_request.number
        : event.name === "pull_request_review" || event.name === "pull_request_review_comment"
          ? event.payload.pull_request.number
          : event.name === "issue_comment" && event.payload.issue.pull_request
            ? event.payload.issue.number
            : undefined;

    this.logger.info("[folio] accepted GitHub webhook", {
      deliveryId,
      event: event.name,
      action: event.action,
      installationId,
      repository,
      pullNumber,
    });

    // Side effects are best-effort: a failure here must not turn the 202 into a
    // 5xx (GitHub would retry the whole delivery). Errors are logged and the
    // job queue / reaper handle retries on their own cadence.
    await this.dispatch(event, deliveryId);

    return {
      received: true,
      deliveryId,
      event: event.name,
      action: event.action,
      installationId,
      repository,
      pullNumber,
    };
  }

  private async dispatch(
    event: NonNullable<ReturnType<GitHubWebhookAdapter["parseEvent"]>>,
    deliveryId: string,
  ): Promise<void> {
    try {
      if (
        event.name === "installation" &&
        INSTALL_DISCONNECT_ACTIONS.has(event.action) &&
        event.payload.installation
      ) {
        await this.installationSync.disconnect(event.payload.installation.id);
        return;
      }

      if (
        event.name === "installation" &&
        INSTALL_SYNC_ACTIONS.has(event.action) &&
        event.payload.installation
      ) {
        const account = event.payload.installation.account as
          | { id: number; login: string; type: AccountType }
          | undefined;
        await this.installationSync.sync({
          githubInstallationId: event.payload.installation.id,
          account: account
            ? { githubAccountId: account.id, login: account.login, type: account.type }
            : undefined,
        });
        return;
      }

      if (
        event.name === "installation_repositories" &&
        (event.action === "added" || event.action === "removed") &&
        event.payload.installation
      ) {
        await this.installationSync.sync({
          githubInstallationId: event.payload.installation.id,
        });
        return;
      }

      if (event.name === "pull_request" && INDEX_PR_ACTIONS.has(event.action)) {
        const repository = event.payload.repository;
        if (!repository) {
          return;
        }
        const enabled = await repositoriesRepo.isFolioEnabledByFullName(repository.full_name);
        if (!enabled) {
          this.logger.info("[folio] skipped disabled repository webhook", {
            repository: repository.full_name,
            action: event.action,
          });
          return;
        }

        // Index upsert is best-effort and must not block review enqueue.
        try {
          const repoRow = await repositoriesRepo.getByFullName(repository.full_name);
          if (repoRow && this.indexWriter) {
            await this.indexWriter.applyPull({
              repoId: repoRow.id,
              owner: repository.owner.login,
              repo: repository.name,
              pull: event.payload.pull_request as {
                number: number;
                title: string;
                user?: { login?: string | null } | null;
                head: { ref: string; sha?: string | null };
                base: { ref: string };
                draft?: boolean;
                state?: string;
                merged_at?: string | null;
                closed_at?: string | null;
                updated_at: string;
                html_url?: string | null;
                additions?: number | null;
                deletions?: number | null;
                changed_files?: number | null;
                labels?: ({ name?: string; color?: string } | string)[] | null;
              },
            });
          }
        } catch (indexErr) {
          this.logger.error("[folio] pull_request index upsert failed", indexErr, {
            deliveryId,
            repository: repository.full_name,
            action: event.action,
          });
        }

        if (REVIEWABLE_PR_ACTIONS.has(event.action)) {
          const owner = repository.owner.login;
          const repo = repository.name;
          const number = event.payload.pull_request.number;
          const { deduplicated } = await this.reviewJobQueue.enqueueReviewPull({
            owner,
            repo,
            number,
            headSha: event.payload.pull_request.head.sha,
          });

          // Signal "queued" on the main PR body immediately (no bot comment required).
          // Skip redelivered/deduped enqueues so we don't spam reaction API noise.
          if (!deduplicated) {
            await this.reactQueuedOnPull({
              deliveryId,
              installationId: event.payload.installation?.id,
              owner,
              repo,
              number,
            });
          }
        }
      }
    } catch (err) {
      this.logger.error("[folio] webhook side-effect failed", err, {
        deliveryId,
        event: event.name,
        action: event.action,
      });
    }
  }

  /** Best-effort 👀 on the PR; never throws into the webhook 202 path. */
  private async reactQueuedOnPull(input: {
    deliveryId: string;
    installationId?: number;
    owner: string;
    repo: string;
    number: number;
  }): Promise<void> {
    if (!input.installationId) {
      return;
    }
    try {
      const octokit = await createInstallationOctokit(input.installationId);
      await createIssueReaction(
        octokit,
        { owner: input.owner, repo: input.repo, number: input.number },
        "eyes",
      );
      this.logger.info("[folio] queued reaction on pull request", {
        deliveryId: input.deliveryId,
        repository: `${input.owner}/${input.repo}`,
        pullNumber: input.number,
        reaction: "eyes",
      });
    } catch (err) {
      this.logger.error("[folio] queued reaction failed", err, {
        deliveryId: input.deliveryId,
        repository: `${input.owner}/${input.repo}`,
        pullNumber: input.number,
      });
    }
  }
}
