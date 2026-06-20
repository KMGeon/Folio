import { Inject, Injectable } from "@nestjs/common";
import type { GitHubWebhookResult } from "../../domain/github/github-webhook.model.js";
import { GitHubWebhookService } from "../../domain/github/github-webhook.service.js";

export interface HandleGitHubWebhookCommand {
  headers: {
    deliveryId?: string;
    eventName?: string;
    signature?: string;
  };
  rawBody: string;
}

@Injectable()
export class GitHubWebhookFacade {
  constructor(
    @Inject(GitHubWebhookService) private readonly gitHubWebhookService: GitHubWebhookService,
  ) {}

  handle(command: HandleGitHubWebhookCommand): Promise<GitHubWebhookResult> {
    return this.gitHubWebhookService.accept(command);
  }
}
