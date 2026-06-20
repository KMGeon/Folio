import { Injectable } from "@nestjs/common";
import { installationsRepo, repositoriesRepo } from "@folio/db";
import { decompose, type DecomposeDeps } from "@folio/decomposition";
import {
  createInstallationOctokit,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  upsertMarkedComment,
} from "@folio/github";
import type { Octokit } from "octokit";
import { config } from "../../config.js";
import { buildChapterCommentBody } from "../../domain/review/chapter-comment-body.js";
import {
  persistReview as defaultPersistReview,
  type PersistReviewInput,
  type PersistedReview,
} from "../../infrastructure/persistence/review-persistence.js";

export interface RunReviewResult {
  prId: string;
  revisionId: string;
  chapters: { order: number; title: string }[];
  commentUrl: string | null;
  commentError: string | null;
}

export interface ReviewPullDeps {
  octokitFactory?: (input: { owner: string; repo: string }) => Octokit | Promise<Octokit>;
  persist?: (input: PersistReviewInput) => Promise<PersistedReview>;
  decomposeDeps?: DecomposeDeps;
}

@Injectable()
export class ReviewPullFacade {
  constructor(private readonly deps: ReviewPullDeps = {}) {}

  async run(input: { owner: string; repo: string; number: number }): Promise<RunReviewResult> {
    const octokit = await (this.deps.octokitFactory ?? createRepoInstallationOctokit)(input);
    const ref = { owner: input.owner, repo: input.repo, number: input.number };

    const summary = await getPullRequest(octokit, ref);
    const rawDiff = await getPullRequestDiff(octokit, ref);
    // Author commit messages are a strong grouping signal for the LLM.
    const commits = await getPullRequestCommits(octokit, ref);

    const { chapters, prologue } = await decompose(
      { diff: rawDiff, prTitle: summary.title, prBody: summary.body, commits },
      { model: config.FOLIO_DECOMP_MODEL },
      this.deps.decomposeDeps ?? {},
    );

    const persist = this.deps.persist ?? defaultPersistReview;
    const persisted = await persist({
      owner: input.owner,
      repo: input.repo,
      summary,
      // Manual trigger has no cheap merge-base lookup; the PR base commit SHA is a stable stand-in.
      mergeBaseSha: summary.baseSha,
      rawDiff,
      chapters,
      prologue,
    });

    // 1-based position matches the read facade's chapter index and the deep-link order.
    const ordered = chapters.map((c, i) => ({ order: i + 1, title: c.title }));

    const body = buildChapterCommentBody({
      org: input.owner,
      repo: input.repo,
      number: input.number,
      webBaseUrl: config.FOLIO_WEB_BASE_URL,
      commitSha: summary.headSha.slice(0, 7),
      chapters: ordered,
    });

    let commentUrl: string | null = null;
    let commentError: string | null = null;
    try {
      // Pass the raw key string; upsertMarkedComment calls commentMarker internally.
      const res = await upsertMarkedComment(octokit, ref, "chapters", body);
      // Comment persistence already committed; a write failure is non-fatal so
      // the caller still gets the review result with a populated commentError.
      commentUrl = `${summary.htmlUrl}#issuecomment-${res.id}`;
    } catch (err) {
      commentError = err instanceof Error ? err.message : String(err);
    }

    return {
      prId: persisted.prId,
      revisionId: persisted.revisionId,
      chapters: ordered,
      commentUrl,
      commentError,
    };
  }
}

async function createRepoInstallationOctokit(input: {
  owner: string;
  repo: string;
}): Promise<Octokit> {
  const repository = await repositoriesRepo.getByFullName(`${input.owner}/${input.repo}`);
  if (!repository) {
    throw new Error(`Repository ${input.owner}/${input.repo} is not installed for Folio`);
  }
  const installation = await installationsRepo.getById(repository.installationId);
  if (!installation) {
    throw new Error(
      `Installation ${repository.installationId} is missing for ${input.owner}/${input.repo}`,
    );
  }
  return createInstallationOctokit(installation.githubInstallationId);
}
