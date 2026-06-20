export interface GitHubWebhookHeaders {
  deliveryId?: string;
  eventName?: string;
  signature?: string;
}

export interface GitHubWebhookCommand {
  headers: GitHubWebhookHeaders;
  rawBody: string;
}

export interface GitHubWebhookResult {
  received: true;
  deliveryId: string;
  event: string;
  ignored?: true;
  action?: string;
  installationId?: number;
  repository?: string;
  pullNumber?: number;
}
