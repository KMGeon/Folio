/**
 * Typed narrowing for the GitHub webhook events Folio subscribes to. We model
 * only the fields downstream modules (I1/I2/I3/I5/I6) actually read; the full
 * raw payload is preserved on `raw` so consumers can reach extra fields without
 * us re-declaring GitHub's entire schema.
 */

export interface RepositoryRefPayload {
  full_name: string;
  owner: { login: string };
  name: string;
}

export interface InstallationRefPayload {
  id: number;
}

interface BasePayload {
  installation?: InstallationRefPayload;
  repository?: RepositoryRefPayload;
  [key: string]: unknown;
}

export interface PullRequestEventPayload extends BasePayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    head: { sha: string; ref: string };
    base: { ref: string };
    [key: string]: unknown;
  };
}

export interface PullRequestReviewEventPayload extends BasePayload {
  action: string;
  review: { state: string; user: { login: string } | null; [key: string]: unknown };
  pull_request: { number: number; [key: string]: unknown };
}

export interface PullRequestReviewCommentEventPayload extends BasePayload {
  action: string;
  comment: { id: number; body: string; [key: string]: unknown };
  pull_request: { number: number; [key: string]: unknown };
}

export interface IssueCommentEventPayload extends BasePayload {
  action: string;
  comment: { id: number; body: string; user: { login: string } | null };
  issue: { number: number; pull_request?: unknown; [key: string]: unknown };
}

export interface CheckRunEventPayload extends BasePayload {
  action: string;
  check_run: { id: number; head_sha: string; [key: string]: unknown };
  requested_action?: { identifier: string };
}

export interface CheckSuiteEventPayload extends BasePayload {
  action: string;
  check_suite: { id: number; head_sha: string; [key: string]: unknown };
}

export interface InstallationEventPayload extends BasePayload {
  action: string;
  installation: InstallationRefPayload & {
    account: { id: number; login: string; type: "User" | "Organization" };
  };
}

export interface InstallationRepositoriesEventPayload extends BasePayload {
  action: string;
  installation: InstallationRefPayload;
  repositories_added?: RepositoryRefPayload[];
  repositories_removed?: RepositoryRefPayload[];
}

/** Discriminated union over the subscribed event names. */
export type WebhookEvent =
  | { name: "pull_request"; action: string; payload: PullRequestEventPayload }
  | {
      name: "pull_request_review";
      action: string;
      payload: PullRequestReviewEventPayload;
    }
  | {
      name: "pull_request_review_comment";
      action: string;
      payload: PullRequestReviewCommentEventPayload;
    }
  | { name: "issue_comment"; action: string; payload: IssueCommentEventPayload }
  | { name: "check_run"; action: string; payload: CheckRunEventPayload }
  | { name: "check_suite"; action: string; payload: CheckSuiteEventPayload }
  | { name: "installation"; action: string; payload: InstallationEventPayload }
  | {
      name: "installation_repositories";
      action: string;
      payload: InstallationRepositoriesEventPayload;
    };

/** Event names Folio subscribes to and parses. */
export const SUBSCRIBED_EVENTS = [
  "pull_request",
  "pull_request_review",
  "pull_request_review_comment",
  "issue_comment",
  "check_run",
  "check_suite",
  "installation",
  "installation_repositories",
] as const;

export type SubscribedEventName = (typeof SUBSCRIBED_EVENTS)[number];

const SUBSCRIBED = new Set<string>(SUBSCRIBED_EVENTS);

function readHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const direct = headers[name];
  if (direct !== undefined) {
    return direct;
  }
  // Header maps are conventionally lower-cased, but be defensive.
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      return headers[key];
    }
  }
  return undefined;
}

/**
 * Narrow a raw webhook delivery into a typed {@link WebhookEvent}. Reads the
 * event name from `X-GitHub-Event` and the action from the parsed body. Returns
 * `null` for unsubscribed events or unparseable bodies — never throws — so the
 * ingestion endpoint (I1) can cleanly ignore noise.
 */
export function parseWebhookEvent(
  headers: Record<string, string | undefined>,
  rawBody: string,
): WebhookEvent | null {
  const name = readHeader(headers, "x-github-event");
  if (!name || !SUBSCRIBED.has(name)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const action = (payload as { action?: unknown }).action;
  const actionStr = typeof action === "string" ? action : "";

  // The cast is sound: name is verified against SUBSCRIBED and each branch's
  // payload type is structurally `BasePayload` + optional fields we read lazily.
  return {
    name,
    action: actionStr,
    payload: payload as never,
  } as WebhookEvent;
}
