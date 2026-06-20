import {
  type ChapterInsert,
  chaptersRepo,
  installationsRepo,
  pullRequestsRepo,
  repositoriesRepo,
  revisionsRepo,
} from "@folio/db";
import type { PullRequestSummary } from "@folio/github";
import { ACCOUNT_TYPE, type Chapter, type Prologue, PULL_REQUEST_STATUS } from "@folio/types";

export interface PersistReviewInput {
  owner: string;
  repo: string;
  summary: PullRequestSummary;
  mergeBaseSha: string;
  rawDiff: string;
  chapters: Chapter[];
  prologue: Prologue | null;
}

export interface PersistedReview {
  prId: string;
  revisionId: string;
  revisionIndex: number;
}

/**
 * Deterministic placeholder installation id for the PAT path (no real GitHub
 * App install). Negative so it can never collide with a real installation id.
 */
export function syntheticInstallationId(owner: string): number {
  let hash = 0;
  for (const ch of owner) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return -Math.abs(hash) - 1;
}

/**
 * Deterministic placeholder repo id for the PAT path (no real GitHub repo id).
 * Derived from the full "owner/repo" name so different repos under the same owner
 * never collide on the UNIQUE githubRepoId column.
 */
export function syntheticRepoId(owner: string, repo: string): number {
  const fullName = `${owner}/${repo}`;
  let hash = 0;
  for (const ch of fullName) {
    hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  }
  return -Math.abs(hash) - 1;
}

function prStatus(summary: PullRequestSummary): "draft" | "open" | "merged" | "closed" {
  if (summary.merged) {
    return PULL_REQUEST_STATUS.MERGED;
  }
  if (summary.draft) {
    return PULL_REQUEST_STATUS.DRAFT;
  }
  if (summary.state === "closed") {
    return PULL_REQUEST_STATUS.CLOSED;
  }
  return PULL_REQUEST_STATUS.OPEN;
}

export async function persistReview(input: PersistReviewInput): Promise<PersistedReview> {
  const ghInstallId = syntheticInstallationId(input.owner);
  const installation = await installationsRepo.upsertByGithubId({
    githubInstallationId: ghInstallId,
    accountLogin: input.owner,
    accountType: ACCOUNT_TYPE.ORGANIZATION,
  });

  // No real GitHub repo id on the PAT path → derive a stable per-repo synthetic one
  // so different repos under the same owner don't collide on the UNIQUE githubRepoId column.
  const fullName = `${input.owner}/${input.repo}`;
  const repository = await repositoriesRepo.upsertByGithubId({
    installationId: installation.id,
    githubRepoId: syntheticRepoId(input.owner, input.repo),
    owner: input.owner,
    name: input.repo,
    fullName,
    private: false,
    defaultBranch: input.summary.baseRef,
  });

  const pr = await pullRequestsRepo.upsertByRepoAndNumber({
    repoId: repository.id,
    githubPrNumber: input.summary.number,
    title: input.summary.title,
    body: input.summary.body,
    authorLogin: input.summary.authorLogin ?? "unknown",
    baseRef: input.summary.baseRef,
    headRef: input.summary.headRef,
    headSha: input.summary.headSha,
    status: prStatus(input.summary),
    htmlUrl: input.summary.htmlUrl,
  });

  const existing = await revisionsRepo.listByPr(pr.id);
  const revision = await revisionsRepo.create({
    prId: pr.id,
    index: existing.length,
    headSha: input.summary.headSha,
    baseSha: input.summary.baseRef,
    mergeBaseSha: input.mergeBaseSha,
    prologue: input.prologue,
    rawDiff: input.rawDiff,
  });

  const rows: ChapterInsert[] = input.chapters.map((c) => ({
    externalId: c.externalId,
    prId: pr.id,
    revisionId: revision.id,
    order: c.order,
    title: c.title,
    summary: c.summary,
    hunkRefs: c.hunkRefs,
    keyChanges: c.keyChanges,
    reviewHints: c.reviewHints,
    risks: c.risks,
    status: c.status,
  }));
  await chaptersRepo.replaceForRevision(revision.id, rows);

  return { prId: pr.id, revisionId: revision.id, revisionIndex: revision.index };
}
