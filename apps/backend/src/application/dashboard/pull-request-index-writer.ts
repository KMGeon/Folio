import {
  PR_INDEX_GITHUB_STATE,
  type PullRequestIndexLabel,
  type PullRequestIndexRow,
  pullRequestIndexRepo,
  repositoriesRepo,
} from "@folio/db";
import { Inject, Injectable } from "@nestjs/common";
import { BoardEventHub } from "./board-event-hub.js";

export type GitHubPullIndexSource = {
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
};

export type ApplyPullIndexInput = {
  repoId: string;
  owner: string;
  repo: string;
  pull: GitHubPullIndexSource;
};

@Injectable()
export class PullRequestIndexWriter {
  constructor(@Inject(BoardEventHub) private readonly hub: BoardEventHub) {}

  async applyPull(input: ApplyPullIndexInput): Promise<PullRequestIndexRow> {
    const labels = mapLabels(input.pull.labels);
    const githubState =
      input.pull.state === "closed" || input.pull.merged_at
        ? PR_INDEX_GITHUB_STATE.CLOSED
        : PR_INDEX_GITHUB_STATE.OPEN;
    const row = await pullRequestIndexRepo.upsert({
      repoId: input.repoId,
      githubPrNumber: input.pull.number,
      title: input.pull.title,
      authorLogin: input.pull.user?.login ?? "unknown",
      baseRef: input.pull.base.ref,
      headRef: input.pull.head.ref,
      headSha: input.pull.head.sha ?? "",
      githubState,
      isDraft: Boolean(input.pull.draft),
      mergedAt: input.pull.merged_at ? new Date(input.pull.merged_at) : null,
      closedAt: input.pull.closed_at ? new Date(input.pull.closed_at) : null,
      githubUpdatedAt: new Date(input.pull.updated_at),
      additions: input.pull.additions ?? 0,
      deletions: input.pull.deletions ?? 0,
      changedFiles: input.pull.changed_files ?? 0,
      labelsJson: labels,
      htmlUrl:
        input.pull.html_url ??
        `https://github.com/${input.owner}/${input.repo}/pull/${input.pull.number}`,
      lastSyncedAt: new Date(),
    });

    this.hub.publish({
      type: "pr.upserted",
      id: cardId(input.owner, input.repo, input.pull.number),
      repoId: input.repoId,
      number: input.pull.number,
      githubUpdatedAt: row.githubUpdatedAt.toISOString(),
      title: row.title,
      author: row.authorLogin,
      isDraft: row.isDraft,
      githubState: row.githubState,
      additions: row.additions,
      deletions: row.deletions,
      changedFiles: row.changedFiles,
    });

    return row;
  }

  async clearRepo(repoId: string): Promise<void> {
    await pullRequestIndexRepo.deleteByRepo(repoId);
    this.hub.publish({
      type: "board.invalidate",
      reason: "repo_scope_changed",
      repoId,
    });
  }

  async resolveRepoIdByFullName(fullName: string): Promise<string | null> {
    const repo = await repositoriesRepo.getByFullName(fullName);
    return repo?.id ?? null;
  }
}

function cardId(owner: string, repo: string, number: number): string {
  return `${owner}-${repo}-${number}`;
}

function mapLabels(labels: GitHubPullIndexSource["labels"]): PullRequestIndexLabel[] {
  if (!labels) {
    return [];
  }
  return labels
    .map((label) => {
      if (typeof label === "string") {
        return { name: label, color: "ededed" };
      }
      if (!label.name) {
        return null;
      }
      return { name: label.name, color: label.color ?? "ededed" };
    })
    .filter((label): label is PullRequestIndexLabel => label !== null);
}
