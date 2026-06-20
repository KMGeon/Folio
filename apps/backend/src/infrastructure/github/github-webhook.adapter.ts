import { parseWebhookEvent, verifyWebhookSignature } from "@folio/github";
import { Injectable } from "@nestjs/common";

@Injectable()
export class GitHubWebhookAdapter {
  verifySignature(input: { rawBody: string; signature?: string; secret: string }) {
    return verifyWebhookSignature(input.rawBody, input.signature, input.secret);
  }

  parseEvent(input: { eventName: string; rawBody: string }) {
    return parseWebhookEvent({ "x-github-event": input.eventName }, input.rawBody);
  }
}
