import { Injectable } from "@nestjs/common";
import { chaptersRepo, pullRequestsRepo, repositoriesRepo, revisionsRepo } from "@folio/db";
import { sliceChapterCode } from "../../domain/review/chapter-diff-slice.js";
import type { ReviewChapter, ReviewPayload } from "../../domain/review/review-read-model.js";
import { syntheticRepoId } from "../../infrastructure/persistence/review-persistence.js";

@Injectable()
export class ReviewReadFacade {
  async getReview(owner: string, repo: string, number: number): Promise<ReviewPayload | null> {
    const repository = await repositoriesRepo.getByGithubId(syntheticRepoId(owner, repo));
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
    const chapters: ReviewChapter[] = rows.map((row, i) => {
      const code = sliceChapterCode(rawDiff, row.hunkRefs);
      return {
        index: i + 1,
        title: row.title,
        summary: row.summary,
        files: code.files,
        diffLines: code.diffLines,
      };
    });

    return {
      pr: {
        org: owner,
        repo,
        number,
        title: pr.title,
        headSha: pr.headSha,
        baseBranch: pr.baseRef,
        headBranch: pr.headRef,
      },
      chapters,
    };
  }
}
