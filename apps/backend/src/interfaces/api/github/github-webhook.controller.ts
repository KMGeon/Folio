import { Body, Controller, Headers, HttpCode, Inject, Post, Req } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { GitHubWebhookFacade } from "../../../application/github/github-webhook.facade.js";

@Controller("webhooks")
export class GitHubWebhookController {
  constructor(
    @Inject(GitHubWebhookFacade) private readonly gitHubWebhookFacade: GitHubWebhookFacade,
  ) {}

  @Post("github")
  @HttpCode(202)
  handle(
    @Req() request: RawBodyRequest<Request>,
    @Headers("x-github-delivery") deliveryId: string | undefined,
    @Headers("x-github-event") eventName: string | undefined,
    @Headers("x-hub-signature-256") signature: string | undefined,
    @Body() parsedBody: unknown,
  ) {
    const rawBody = request.rawBody?.toString("utf8") ?? JSON.stringify(parsedBody ?? {});

    return this.gitHubWebhookFacade.handle({
      headers: {
        deliveryId,
        eventName,
        signature,
      },
      rawBody,
    });
  }
}
