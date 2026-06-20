import { CHAPTER_STATUS, DIFF_SIDE, type HunkReference, type KeyChange } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { chaptersRepo, pullRequestsRepo, revisionsRepo } from "../src/repos/index.js";
import { HAS_DB, getTestDb, nonNull, resetDb } from "./helpers/db.js";
import { type BaseFixture, seedBase } from "./helpers/fixtures.js";

const d = HAS_DB ? describe : describe.skip;

d("repositories (e2e)", () => {
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

  it("round-trips jsonb hunkRefs/keyChanges on chapters", async () => {
    const hunkRefs: HunkReference[] = [{ filePath: "src/a.ts", oldStart: 10 }];
    const keyChanges: KeyChange[] = [
      {
        id: "kc-1",
        externalId: "ext-1",
        content: "Why is this safe?",
        lineRefs: [{ filePath: "src/a.ts", side: DIFF_SIDE.ADDITIONS, startLine: 1, endLine: 4 }],
      },
    ];
    const [chapter] = await chaptersRepo.replaceForRevision(
      base.revisionId,
      [
        {
          externalId: "c1",
          prId: base.prId,
          revisionId: base.revisionId,
          order: "1",
          title: "First",
          summary: "s",
          hunkRefs,
          keyChanges,
          reviewHints: [],
          risks: [],
          status: CHAPTER_STATUS.PUBLISHED,
        },
      ],
      db,
    );
    const fetched = await chaptersRepo.getById(nonNull(chapter).id, db);
    expect(fetched?.hunkRefs).toEqual(hunkRefs);
    expect(fetched?.keyChanges).toEqual(keyChanges);
  });

  it("replaceForRevision swaps the whole chapter set", async () => {
    await chaptersRepo.replaceForRevision(base.revisionId, [mkChapter(base, "old", "1")], db);
    await chaptersRepo.replaceForRevision(
      base.revisionId,
      [mkChapter(base, "new-a", "1"), mkChapter(base, "new-b", "2")],
      db,
    );
    const list = await chaptersRepo.listByRevision(base.revisionId, db);
    expect(list.map((c) => c.externalId)).toEqual(["new-a", "new-b"]);
  });

  it("upserts a pull request by (repo, number)", async () => {
    const pr = nonNull(await pullRequestsRepo.getById(base.prId, db));
    const updated = await pullRequestsRepo.upsertByRepoAndNumber(
      {
        repoId: pr.repoId,
        githubPrNumber: pr.githubPrNumber,
        title: "Renamed",
        body: "new body",
        authorLogin: pr.authorLogin,
        baseRef: pr.baseRef,
        headRef: pr.headRef,
        headSha: pr.headSha,
        status: pr.status,
        htmlUrl: pr.htmlUrl,
      },
      db,
    );
    expect(updated.id).toBe(pr.id);
    expect(updated.title).toBe("Renamed");
  });

  it("lists revisions ordered by index and finds latest", async () => {
    await revisionsRepo.create(
      {
        prId: base.prId,
        index: 1,
        headSha: "d".repeat(40),
        baseSha: "b".repeat(40),
        mergeBaseSha: "c".repeat(40),
      },
      db,
    );
    const list = await revisionsRepo.listByPr(base.prId, db);
    expect(list.map((r) => r.index)).toEqual([0, 1]);
    const latest = await revisionsRepo.latestForPr(base.prId, db);
    expect(latest?.index).toBe(1);
  });
});

function mkChapter(base: BaseFixture, externalId: string, order: string) {
  return {
    externalId,
    prId: base.prId,
    revisionId: base.revisionId,
    order,
    title: externalId,
    summary: "s",
    hunkRefs: [],
    keyChanges: [],
    reviewHints: [],
    risks: [],
    status: CHAPTER_STATUS.PUBLISHED,
  };
}
