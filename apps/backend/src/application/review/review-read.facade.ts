import { Injectable, Logger } from "@nestjs/common";
import {
  chaptersRepo,
  installationsRepo,
  pullRequestsRepo,
  repositoriesRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";
import {
  createInstallationOctokit,
  getPullRequestCommits,
  getRepositoryCommits,
  listIssueComments,
} from "@folio/github";
import { sliceChapterCode } from "../../domain/review/chapter-diff-slice.js";
import type {
  ReviewChapter,
  ReviewCommit,
  ReviewIssueComment,
  ReviewPayload,
} from "../../domain/review/review-read-model.js";

@Injectable()
export class ReviewReadFacade {
  private readonly logger = new Logger(ReviewReadFacade.name);

  async getReview(
    owner: string,
    repo: string,
    number: number,
    userId: string,
  ): Promise<ReviewPayload | null> {
    const repository = await repositoriesRepo.getByFullName(`${owner}/${repo}`);
    if (!repository) {
      return null;
    }

    const pr = await pullRequestsRepo.getByRepoAndNumber(repository.id, number);
    if (!pr) {
      return null;
    }

    const revision = await revisionsRepo.latestForPr(pr.id);
    if (!revision) {
      return null;
    }

    const rawDiff = revision.rawDiff ?? "";
    const rows = await chaptersRepo.listByRevision(revision.id);
    const { chapterIds } = await reviewStateRepo.viewedForRevision(userId, revision.id);
    const viewedIds = new Set(chapterIds);
    const chapters: ReviewChapter[] = rows.map((row, i) => {
      const code = sliceChapterCode(rawDiff, row.hunkRefs);
      return {
        index: i + 1,
        title: row.title,
        summary: row.summary,
        files: code.files,
        diffLines: code.diffLines,
        viewed: viewedIds.has(row.id),
      };
    });

    let commits: ReviewCommit[] = [];
    let commitsTruncated = false;
    let comments: ReviewIssueComment[] = [];
    try {
      const installation = await installationsRepo.getById(repository.installationId);
      if (installation) {
        const octokit = await createInstallationOctokit(installation.githubInstallationId);
        // Live GitHub reads are additive UI context; each section degrades independently.
        try {
          const [basePage, prCommits] = await Promise.all([
            getRepositoryCommits(octokit, { owner, repo, sha: pr.baseRef, perPage: 20 }),
            getPullRequestCommits(octokit, { owner, repo, number }),
          ]);
          commitsTruncated = basePage.hasMore;
          commits = mergeCommitFlow(
            basePage.commits.map((commit) => ({ ...commit, branch: "base" as const })),
            prCommits.map((commit) => ({ ...commit, branch: "head" as const })),
          );
        } catch (err) {
          this.logger.warn(`Failed to load commits for ${owner}/${repo}#${number}: ${String(err)}`);
        }
        try {
          comments = (await listIssueComments(octokit, { owner, repo, number })).map((comment) => ({
            id: comment.id,
            body: stripFolioMarker(comment.body),
            author: comment.user,
            avatarUrl: comment.avatarUrl,
            createdAt: comment.createdAt,
            htmlUrl: comment.htmlUrl,
          }));
        } catch (err) {
          this.logger.warn(
            `Failed to load comments for ${owner}/${repo}#${number}: ${String(err)}`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to create GitHub client for ${owner}/${repo}#${number}: ${String(err)}`,
      );
    }

    return {
      pr: {
        org: owner,
        repo,
        number,
        title: pr.title,
        body: pr.body ?? "",
        status: pr.status,
        author: pr.authorLogin,
        htmlUrl: pr.htmlUrl,
        headSha: pr.headSha,
        baseBranch: pr.baseRef,
        headBranch: pr.headRef,
      },
      chapters,
      comments,
      commits,
      commitsTruncated,
    };
  }
}

function mergeCommitFlow(baseCommits: ReviewCommit[], headCommits: ReviewCommit[]): ReviewCommit[] {
  const bySha = new Map<string, ReviewCommit>();
  for (const commit of baseCommits.reverse()) {
    bySha.set(commit.sha, commit);
  }
  for (const commit of headCommits) {
    bySha.set(commit.sha, commit);
  }
  return [...bySha.values()];
}

function stripFolioMarker(body: string): string {
  return body.replace(/\n*\s*<!-- folio:[\w-]+ -->\s*$/u, "").trim();
}
