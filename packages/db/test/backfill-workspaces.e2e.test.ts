import { ACCOUNT_TYPE, GLOBAL_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { backfillWorkspaces } from "../src/migrate/backfill-workspaces.js";
import {
  installationsRepo,
  repositoriesRepo,
  usersRepo,
  workspacesRepo,
} from "../src/repos/index.js";
import { USER_STATUS } from "../src/schema/users.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;

d("backfillWorkspaces (e2e)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("creates workspaces, links repositories, maps approved users, and is idempotent", async () => {
    const installation = await installationsRepo.create(
      {
        githubInstallationId: 11,
        accountLogin: "acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      },
      db,
    );
    await repositoriesRepo.create(
      {
        installationId: installation.id,
        githubRepoId: 22,
        owner: "acme",
        name: "widget",
        fullName: "acme/widget",
        private: false,
        defaultBranch: "main",
      },
      db,
    );
    const legacyUser = await usersRepo.create(
      { githubUserId: 1, login: "old", avatarUrl: "x" },
      db,
    );
    const approvedUser = await usersRepo.approve(legacyUser.id, db);
    expect(approvedUser?.status).toBe(USER_STATUS.APPROVED);

    const resolveAccountId = vi.fn(async (_githubInstallationId: number) => 4242);
    await backfillWorkspaces(db, { resolveAccountId });
    await backfillWorkspaces(db, { resolveAccountId });

    expect(resolveAccountId).toHaveBeenCalledOnce();
    expect(resolveAccountId).toHaveBeenCalledWith(11);
    const migratedInstallation = await installationsRepo.getById(installation.id, db);
    expect(migratedInstallation?.githubAccountId).toBe(4242);
    const workspace = await workspacesRepo.getByGithubAccountId(4242, db);
    expect(workspace).not.toBeNull();
    const repositories = await repositoriesRepo.listByInstallationIds([installation.id], db);
    expect(repositories[0]?.workspaceId).toBe(workspace?.id);
    const migratedUser = await usersRepo.getById(legacyUser.id, db);
    expect(migratedUser?.globalStatus).toBe(GLOBAL_STATUS.ACTIVE);
  });
});
