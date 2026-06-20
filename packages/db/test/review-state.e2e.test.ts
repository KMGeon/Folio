import { CHAPTER_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { chaptersRepo, reviewStateRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, nonNull, resetDb } from "./helpers/db.js";
import { type BaseFixture, seedBase } from "./helpers/fixtures.js";

const d = HAS_DB ? describe : describe.skip;

d("review state (e2e)", () => {
  let db: Db;
  let base: BaseFixture;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
    base = await seedBase(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("marks a file viewed idempotently", async () => {
    const p = { userId: base.userId, revisionId: base.revisionId, filePath: "src/a.ts" };
    await reviewStateRepo.markFileViewed(p, db);
    await reviewStateRepo.markFileViewed(p, db); // idempotent
    const viewed = await reviewStateRepo.viewedForRevision(base.userId, base.revisionId, db);
    expect(viewed.filePaths).toEqual(["src/a.ts"]);
  });

  it("unmarks a file", async () => {
    const p = { userId: base.userId, revisionId: base.revisionId, filePath: "src/a.ts" };
    await reviewStateRepo.markFileViewed(p, db);
    await reviewStateRepo.unmarkFileViewed(p, db);
    const viewed = await reviewStateRepo.viewedForRevision(base.userId, base.revisionId, db);
    expect(viewed.filePaths).toEqual([]);
  });

  it("counts chapter progress per revision", async () => {
    const chapters = await chaptersRepo.replaceForRevision(
      base.revisionId,
      [makeChapter(base, "c1", "1"), makeChapter(base, "c2", "2"), makeChapter(base, "c3", "3")],
      db,
    );
    expect(chapters).toHaveLength(3);

    const [c0, c1] = chapters;
    let progress = await reviewStateRepo.progressForRevision(base.userId, base.revisionId, db);
    expect(progress).toEqual({ viewed: 0, total: 3 });

    await reviewStateRepo.markChapterViewed(
      { userId: base.userId, chapterId: nonNull(c0).id, revisionId: base.revisionId },
      db,
    );
    await reviewStateRepo.markChapterViewed(
      { userId: base.userId, chapterId: nonNull(c1).id, revisionId: base.revisionId },
      db,
    );
    // Idempotent re-mark of the same chapter.
    await reviewStateRepo.markChapterViewed(
      { userId: base.userId, chapterId: nonNull(c1).id, revisionId: base.revisionId },
      db,
    );

    progress = await reviewStateRepo.progressForRevision(base.userId, base.revisionId, db);
    expect(progress).toEqual({ viewed: 2, total: 3 });
  });
});

function makeChapter(base: BaseFixture, externalId: string, order: string) {
  return {
    externalId,
    prId: base.prId,
    revisionId: base.revisionId,
    order,
    title: `Chapter ${externalId}`,
    summary: "summary",
    hunkRefs: [],
    keyChanges: [],
    reviewHints: [],
    risks: [],
    status: CHAPTER_STATUS.PUBLISHED,
  };
}
