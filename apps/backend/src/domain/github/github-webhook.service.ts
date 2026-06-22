import { Inject, Injectable } from "@nestjs/common";
import { repositoriesRepo } from "@folio/db";
import type { AccountType } from "@folio/types";
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
// installation actions that (re)grant access and warrant a repository sync.
const INSTALL_SYNC_ACTIONS = new Set(["created", "new_permissions_accepted", "unsuspend"]);

@Injectable()
export class GitHubWebhookService {
  constructor(
    @Inject(GitHubWebhookAdapter) private readonly gitHubWebhookAdapter: GitHubWebhookAdapter,
    @Inject(ReviewJobQueue) private readonly reviewJobQueue: ReviewJobQueue,
    @Inject(InstallationSyncFacade) private readonly installationSync: InstallationSyncFacade,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
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
        INSTALL_SYNC_ACTIONS.has(event.action) &&
        event.payload.installation
      ) {
        const account = event.payload.installation.account as
          | { login: string; type: AccountType }
          | undefined;
        await this.installationSync.sync({
          githubInstallationId: event.payload.installation.id,
          account: account ? { login: account.login, type: account.type } : undefined,
        });
        return;
      }

      if (
        event.name === "installation_repositories" &&
        event.action === "added" &&
        event.payload.installation
      ) {
        await this.installationSync.sync({
          githubInstallationId: event.payload.installation.id,
        });
        return;
      }

      if (event.name === "pull_request" && REVIEWABLE_PR_ACTIONS.has(event.action)) {
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
        await this.reviewJobQueue.enqueueReviewPull({
          owner: repository.owner.login,
          repo: repository.name,
          number: event.payload.pull_request.number,
          headSha: event.payload.pull_request.head.sha,
        });
      }
    } catch (err) {
      this.logger.error("[folio] webhook side-effect failed", err, {
        deliveryId,
        event: event.name,
        action: event.action,
      });
    }
  }
}
