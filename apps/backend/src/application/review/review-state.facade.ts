import { Injectable } from "@nestjs/common";
import {
  chaptersRepo,
  pullRequestsRepo,
  repositoriesRepo,
  reviewStateRepo,
  revisionsRepo,
} from "@folio/db";

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

export interface SetFileViewedInput {
  owner: string;
  repo: string;
  number: number;
  path: string;
  viewed: boolean;
  userId: string;
}

export interface FileViewedResult {
  path: string;
  viewed: boolean;
  progress: { viewed: number; total: number };
}

export interface SetKeyChangeViewedInput {
  owner: string;
  repo: string;
  number: number;
  /** 1-based chapter position, matching the read facade and deep-link order. */
  index: number;
  keyChangeId: string;
  viewed: boolean;
  userId: string;
}

export interface KeyChangeViewedResult {
  id: string;
  viewed: boolean;
}

@Injectable()
export class ReviewStateFacade {
  /** Mark/unmark a chapter viewed for the user; returns the new viewed + progress. */
  async setChapterViewed(input: SetChapterViewedInput): Promise<ChapterViewedResult | null> {
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

  /** Mark/unmark a file viewed for the user; returns file-level progress. */
  async setFileViewed(input: SetFileViewedInput): Promise<FileViewedResult | null> {
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
    const rows = await chaptersRepo.listByRevision(revision.id);
    const filePaths = [...new Set(rows.flatMap((row) => row.hunkRefs.map((ref) => ref.filePath)))];
    if (!filePaths.includes(input.path)) {
      return null;
    }

    await (input.viewed
      ? reviewStateRepo.markFileViewed({
          userId: input.userId,
          revisionId: revision.id,
          filePath: input.path,
        })
      : reviewStateRepo.unmarkFileViewed({
          userId: input.userId,
          revisionId: revision.id,
          filePath: input.path,
        }));

    const progress = await reviewStateRepo.fileProgressForRevision(
      input.userId,
      revision.id,
      filePaths,
    );
    return { path: input.path, viewed: input.viewed, progress };
  }

  /** Mark/unmark one generated review question for the user. */
  async setKeyChangeViewed(input: SetKeyChangeViewedInput): Promise<KeyChangeViewedResult | null> {
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
    const rows = await chaptersRepo.listByRevision(revision.id);
    const chapter = rows[input.index - 1];
    if (!chapter || !chapter.keyChanges.some((keyChange) => keyChange.id === input.keyChangeId)) {
      return null;
    }

    await (input.viewed
      ? reviewStateRepo.markKeyChangeViewed({
          userId: input.userId,
          chapterId: chapter.id,
          keyChangeId: input.keyChangeId,
        })
      : reviewStateRepo.unmarkKeyChangeViewed({
          userId: input.userId,
          chapterId: chapter.id,
          keyChangeId: input.keyChangeId,
        }));

    return { id: input.keyChangeId, viewed: input.viewed };
  }
}
