import { Injectable } from "@nestjs/common";
import {
  chaptersRepo,
  commentsRepo,
  installationsRepo,
  pullRequestsRepo,
  repositoriesRepo,
  revisionsRepo,
} from "@folio/db";
import { COMMENT_SOURCE, DIFF_SIDE, type DiffSide } from "@folio/types";
import { createInstallationOctokit, createReviewComment } from "@folio/github";
import { sliceChapterCode } from "../../domain/review/chapter-diff-slice.js";
import { isCommentTargetInChapter } from "../../domain/review/comment-target.js";

export interface CreateInlineCommentInput {
  owner: string;
  repo: string;
  number: number;
  chapterIndex: number;
  path: string;
  side: "LEFT" | "RIGHT";
  line: number;
  body: string;
  authorLogin: string;
}

export interface CreatedInlineCommentResult {
  id: string;
  githubCommentId: number;
  htmlUrl: string;
}

@Injectable()
export class ReviewCommentFacade {
  /** Create a GitHub inline PR comment and keep Folio's comment table in sync. */
  async createInlineComment(
    input: CreateInlineCommentInput,
  ): Promise<CreatedInlineCommentResult | null> {
    const repository = await repositoriesRepo.getByFullName(`${input.owner}/${input.repo}`);
    if (!repository) {
      return null;
    }
    const pr = await pullRequestsRepo.getByRepoAndNumber(repository.id, input.number);
    if (!pr) {
      return null;
    }
    const revision = await revisionsRepo.latestForPr(pr.id);
    if (!revision) {
      return null;
    }
    const chapters = await chaptersRepo.listByRevision(revision.id);
    const chapter = chapters[input.chapterIndex - 1];
    if (!chapter) {
      return null;
    }
    const code = sliceChapterCode(revision.rawDiff ?? "", chapter.hunkRefs ?? []);
    if (
      !isCommentTargetInChapter(code, {
        path: input.path,
        side: input.side,
        line: input.line,
      })
    ) {
      return null;
    }
    const installation = await installationsRepo.getById(repository.installationId);
    if (!installation) {
      return null;
    }

    const octokit = await createInstallationOctokit(installation.githubInstallationId);
    const githubComment = await createReviewComment(
      octokit,
      { owner: input.owner, repo: input.repo, number: input.number },
      {
        body: input.body,
        commitSha: pr.headSha,
        path: input.path,
        side: input.side,
        line: input.line,
      },
    );
    const side: DiffSide = input.side === "LEFT" ? DIFF_SIDE.DELETIONS : DIFF_SIDE.ADDITIONS;
    const row = await commentsRepo.create({
      prId: pr.id,
      revisionId: revision.id,
      chapterId: chapter.id,
      lineRef: {
        filePath: input.path,
        side,
        startLine: input.line,
        endLine: input.line,
      },
      authorLogin: input.authorLogin,
      body: input.body,
      githubCommentId: githubComment.id,
      source: COMMENT_SOURCE.FOLIO,
    });

    return {
      id: row.id,
      githubCommentId: githubComment.id,
      htmlUrl: githubComment.htmlUrl,
    };
  }
}
