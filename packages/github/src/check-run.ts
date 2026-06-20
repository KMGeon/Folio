import type { Octokit } from "octokit";
import type { PullRequestRef } from "./ref.js";

export type CheckRunStatus = "queued" | "in_progress" | "completed";
export type CheckRunConclusion =
  | "success"
  | "neutral"
  | "failure"
  | "action_required"
  | "cancelled"
  | "timed_out"
  | "skipped";

export interface CheckRunAction {
  /** Button text shown on the check; GitHub caps this at 20 chars. */
  label: string;
  /** Short description (≤40 chars per GitHub). */
  description: string;
  /** Opaque id echoed back on the `check_run.requested_action` webhook. */
  identifier: string;
}

export interface CheckRunOutput {
  title: string;
  summary: string;
  /** Optional long-form markdown body. */
  text?: string;
}

export interface CheckRunInput {
  headSha: string;
  name: string;
  status: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  /**
   * The clickable "Open in Folio" link. This is GitHub-App-only — a PAT or the
   * default `GITHUB_TOKEN` cannot set a custom Check Run `details_url`.
   */
  detailsUrl?: string;
  output?: CheckRunOutput;
  actions?: CheckRunAction[];
}

/** GitHub limits: ≤3 actions, label ≤20 chars, description ≤40 chars. */
const MAX_ACTIONS = 3;
const MAX_LABEL_LEN = 20;
const MAX_DESCRIPTION_LEN = 40;

function validateActions(actions: CheckRunAction[]): void {
  if (actions.length > MAX_ACTIONS) {
    throw new Error(`Check Run supports at most ${MAX_ACTIONS} actions (got ${actions.length})`);
  }
  for (const a of actions) {
    if (a.label.length > MAX_LABEL_LEN) {
      throw new Error(`Check Run action label "${a.label}" exceeds ${MAX_LABEL_LEN} chars`);
    }
    if (a.description.length > MAX_DESCRIPTION_LEN) {
      throw new Error(
        `Check Run action description for "${a.label}" exceeds ${MAX_DESCRIPTION_LEN} chars`,
      );
    }
  }
}

interface CheckRunRestBody {
  name?: string;
  head_sha?: string;
  status?: CheckRunStatus;
  conclusion?: CheckRunConclusion;
  details_url?: string;
  output?: CheckRunOutput;
  actions?: CheckRunAction[];
}

/**
 * Assemble the REST request body from our friendly camelCase input. Exported for
 * unit testing payload shape without hitting the network. Validates the actions
 * constraints up front so a bad payload fails locally, not at GitHub.
 */
export function buildCheckRunBody(input: Partial<CheckRunInput>): CheckRunRestBody {
  if (input.actions) {
    validateActions(input.actions);
  }
  const body: CheckRunRestBody = {};
  if (input.name !== undefined) {
    body.name = input.name;
  }
  if (input.headSha !== undefined) {
    body.head_sha = input.headSha;
  }
  if (input.status !== undefined) {
    body.status = input.status;
  }
  if (input.conclusion !== undefined) {
    body.conclusion = input.conclusion;
  }
  if (input.detailsUrl !== undefined) {
    body.details_url = input.detailsUrl;
  }
  if (input.output !== undefined) {
    body.output = input.output;
  }
  if (input.actions !== undefined) {
    body.actions = input.actions;
  }
  return body;
}

/** Create a Check Run on `headSha`. Returns the new check-run id. */
export async function createCheckRun(
  client: Octokit,
  ref: Pick<PullRequestRef, "owner" | "repo">,
  input: CheckRunInput,
): Promise<{ id: number }> {
  const body = buildCheckRunBody(input);
  const { data } = await client.rest.checks.create({
    owner: ref.owner,
    repo: ref.repo,
    name: input.name,
    head_sha: input.headSha,
    ...body,
  });
  return { id: data.id };
}

/** Update an existing Check Run (status/conclusion/output/actions). */
export async function updateCheckRun(
  client: Octokit,
  ref: Pick<PullRequestRef, "owner" | "repo">,
  checkRunId: number,
  input: Partial<CheckRunInput>,
): Promise<void> {
  const body = buildCheckRunBody(input);
  await client.rest.checks.update({
    owner: ref.owner,
    repo: ref.repo,
    check_run_id: checkRunId,
    ...body,
  });
}
