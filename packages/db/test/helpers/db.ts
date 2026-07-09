import type { Db } from "../../src/client.js";
import { getDb, runMigrations } from "../../src/client.js";
import * as schema from "../../src/schema/index.js";

/** True when an e2e DB is configured; tests skip themselves otherwise. */
export const HAS_DB = Boolean(process.env.SUPABASE_DATABASE_URL);

let migrated = false;

/** Get a migrated db handle for tests. Runs migrations once per process. */
export async function getTestDb(): Promise<Db> {
  const db = getDb();
  if (!migrated) {
    await runMigrations(db);
    migrated = true;
  }
  return db;
}

/**
 * Truncate every table (cascade) so each test starts clean. Order doesn't
 * matter with CASCADE + RESTART IDENTITY.
 */
export async function resetDb(db: Db): Promise<void> {
  const tables = [
    "foliant_messages",
    "foliant_threads",
    "subscriptions",
    "jobs",
    "comments",
    "chapter_review_state",
    "file_review_state",
    "chapter_files",
    "chapters",
    "revisions",
    "pull_requests",
    "sessions",
    "users",
    "repositories",
    "installations",
  ];
  const { sql } = await import("drizzle-orm");
  await db.execute(sql.raw(`truncate table ${tables.map((t) => `"${t}"`).join(", ")} cascade`));
}

/** Narrow `T | null | undefined` to `T`, failing the test if absent. */
export function nonNull<T>(value: T | null | undefined, message = "expected a value"): T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
}

export { schema };
