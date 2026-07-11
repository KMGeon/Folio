import { GLOBAL_STATUS } from "@folio/types";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/client.js";
import { closeDb } from "../src/client.js";
import { adminUsersRepo, usersRepo } from "../src/repos/index.js";
import type { UserRow } from "../src/schema/users.js";
import { HAS_DB, getTestDb, resetDb } from "./helpers/db.js";

const d = HAS_DB ? describe : describe.skip;
const CREATED_AT = new Date("2026-01-02T03:04:05.000Z");

interface SeededUsers {
  firstUser: UserRow;
  second: UserRow;
  third: UserRow;
}

async function seedUsers(db: Db): Promise<SeededUsers> {
  const firstUser = await usersRepo.create(
    {
      id: "00000000-0000-4000-8000-000000000001",
      githubUserId: 1,
      login: "first-user",
      avatarUrl: "https://example.com/first.png",
      email: "first@example.com",
      globalStatus: GLOBAL_STATUS.PENDING,
      createdAt: CREATED_AT,
    },
    db,
  );
  const second = await usersRepo.create(
    {
      id: "00000000-0000-4000-8000-000000000002",
      githubUserId: 2,
      login: "second-user",
      avatarUrl: "https://example.com/second.png",
      email: "needle@folio.dev",
      globalStatus: GLOBAL_STATUS.SUSPENDED,
      createdAt: CREATED_AT,
    },
    db,
  );
  const third = await usersRepo.create(
    {
      id: "00000000-0000-4000-8000-000000000003",
      githubUserId: 3,
      login: "octocat",
      avatarUrl: "https://example.com/octocat.png",
      email: null,
      globalStatus: GLOBAL_STATUS.ACTIVE,
      createdAt: CREATED_AT,
    },
    db,
  );
  return { firstUser, second, third };
}

d("adminUsersRepo (e2e)", () => {
  let db: Db;

  beforeEach(async () => {
    db = await getTestDb();
    await resetDb(db);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("paginates equal timestamps by descending id without gaps", async () => {
    const { firstUser, second, third } = await seedUsers(db);

    const first = await adminUsersRepo.list({ limit: 2 }, db);
    expect(first.items.map((user) => user.id)).toEqual([third.id, second.id]);
    expect(first.hasMore).toBe(true);

    const secondPage = await adminUsersRepo.list(
      {
        limit: 2,
        cursor: { createdAt: second.createdAt, id: second.id },
      },
      db,
    );
    expect(secondPage.items.map((user) => user.id)).toEqual([firstUser.id]);
    expect(secondPage.hasMore).toBe(false);
  });

  it("searches login and email case-insensitively with trimmed input", async () => {
    await seedUsers(db);

    await expect(adminUsersRepo.list({ q: "OCTO", limit: 25 }, db)).resolves.toMatchObject({
      items: [expect.objectContaining({ login: "octocat" })],
    });
    await expect(adminUsersRepo.list({ q: "  NEEDLE  ", limit: 25 }, db)).resolves.toMatchObject({
      items: [expect.objectContaining({ login: "second-user" })],
    });
  });

  it("filters by global status and counts pending users", async () => {
    await seedUsers(db);

    await expect(
      adminUsersRepo.list({ status: GLOBAL_STATUS.SUSPENDED, limit: 25 }, db),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ globalStatus: "suspended" })],
    });
    await expect(adminUsersRepo.countPending(db)).resolves.toBe(1);
  });
});
