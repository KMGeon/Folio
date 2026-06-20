import { Injectable } from "@nestjs/common";
import {
  chaptersRepo,
  pullRequestsRepo,
  repositoriesRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";
import { syntheticRepoId } from "../../infrastructure/persistence/review-persistence.js";

export interface SetChapterViewedInput {
  owner: string;
  repo: string;
  number: number;
  /** 1-based chapter position, matching the read facade and deep-link order. */
  index: number;
  viewed: boolean;
  userId: string;
}

export interface ChapterViewedResult {
  index: number;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

@Injectable()
export class ReviewStateFacade {
  /** Mark/unmark a chapter viewed for the user; returns the new viewed + progress. */
  async setChapterViewed(input: SetChapterViewedInput): Promise<ChapterViewedResult | null> {
    const repository = await repositoriesRepo.getByGithubId(
      syntheticRepoId(input.owner, input.repo),
    );
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
    const rows = await chaptersRepo.listByRevision(revision.id);
    const chapter = rows[input.index - 1];
    if (!chapter) {
      return null;
    }

    await (input.viewed
      ? reviewStateRepo.markChapterViewed({
          userId: input.userId,
          chapterId: chapter.id,
          revisionId: revision.id,
        })
      : reviewStateRepo.unmarkChapterViewed({ userId: input.userId, chapterId: chapter.id }));

    const progress = await reviewStateRepo.progressForRevision(input.userId, revision.id);
    return { index: input.index, viewed: input.viewed, progress };
  }
}
