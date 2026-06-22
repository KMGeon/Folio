import { CHAPTER_STATUS, DIFF_SIDE, type HunkReference, type KeyChange } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { chaptersRepo, pullRequestsRepo, revisionsRepo } from "../src/repos/index.js";
import { repositoriesRepo } from "../src/repos/index.js";
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

  it("creates newly discovered repositories as inactive by default", async () => {
    const repo = await repositoriesRepo.create(
      {
        installationId: base.installationId,
        githubRepoId: 987654,
        owner: "KMGeon",
        name: "inactive-by-default",
        fullName: "KMGeon/inactive-by-default",
        private: false,
        defaultBranch: "main",
      },
      db,
    );

    expect(repo.folioEnabled).toBe(false);
  });

  it("preserves repository activation when syncing an existing repository", async () => {
    const enabled = await repositoriesRepo.setFolioEnabled(base.repoId, true, db);

    const synced = await repositoriesRepo.upsertByGithubId(
      {
        installationId: enabled.installationId,
        githubRepoId: enabled.githubRepoId,
        owner: enabled.owner,
        name: enabled.name,
        fullName: enabled.fullName,
        private: enabled.private,
        defaultBranch: "trunk",
      },
      db,
    );

    expect(synced.id).toBe(base.repoId);
    expect(synced.defaultBranch).toBe("trunk");
    expect(synced.folioEnabled).toBe(true);
  });

  it("updates repository activation and lists enabled repositories", async () => {
    const disabled = await repositoriesRepo.create(
      {
        installationId: base.installationId,
        githubRepoId: 987655,
        owner: "KMGeon",
        name: "still-disabled",
        fullName: "KMGeon/still-disabled",
        private: false,
        defaultBranch: "main",
      },
      db,
    );
    await repositoriesRepo.setFolioEnabled(base.repoId, true, db);

    const enabled = await repositoriesRepo.getById(base.repoId, db);
    const enabledRepos = await repositoriesRepo.listEnabledByInstallation(base.installationId, db);
    const enabledRepoIds = enabledRepos.map((repo) => repo.id);

    expect(enabled?.folioEnabled).toBe(true);
    expect(enabledRepoIds).toContain(base.repoId);
    expect(enabledRepoIds).not.toContain(disabled.id);
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
