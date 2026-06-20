import { Inject, Injectable } from "@nestjs/common";
import { config } from "../../config.js";
import { GitHubWebhookAdapter } from "../../infrastructure/github/github-webhook.adapter.js";
import { LOGGER_PORT } from "../../internal/logger/logger.port.js";
import type { LoggerPort } from "../../internal/logger/logger.port.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import type { GitHubWebhookCommand, GitHubWebhookResult } from "./github-webhook.model.js";

@Injectable()
export class GitHubWebhookService {
  constructor(
    @Inject(GitHubWebhookAdapter) private readonly gitHubWebhookAdapter: GitHubWebhookAdapter,
    @Inject(LOGGER_PORT) private readonly logger: LoggerPort,
  ) {}

  accept(command: GitHubWebhookCommand): GitHubWebhookResult {
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

    // TODO(I1): enqueue decomposition/sync work for subscribed GitHub events.
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
}
