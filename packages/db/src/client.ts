import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Db = NodePgDatabase<typeof schema>;

interface CachedHandle {
  pool: Pool;
  db: Db;
  connectionString: string;
}

let cached: CachedHandle | null = null;

function resolveConnectionString(explicit?: string): string {
  const connectionString = explicit ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. @folio/db requires a Postgres connection string (F2 runs Postgres on port 5433 in dev).",
    );
  }
  return connectionString;
}

/**
 * Lazily create (and cache) a pooled Drizzle handle over a singleton `pg.Pool`.
 * Cached database handle; reconnects if the connection
 * string changes (e.g. between tests).
 */
export function getDb(opts: { connectionString?: string } = {}): Db {
  const connectionString = resolveConnectionString(opts.connectionString);
  if (cached && cached.connectionString === connectionString) {
    return cached.db;
  }
  if (cached) {
    // Different target — drop the old pool before opening a new one.
    void cached.pool.end();
    cached = null;
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  cached = { pool, db, connectionString };
  return db;
}

/** Close the cached pool (and clear the cache). Safe to call when none exists. */
export async function closeDb(): Promise<void> {
  if (!cached) {
    return;
  }
  const { pool } = cached;
  cached = null;
  await pool.end();
}

/**
 * Apply all generated migrations. Defaults to the cached/`getDb()` handle.
 * Locates the package's `drizzle/` folder by walking up from this module so it
 * works from both `src/` (dev) and a bundled `dist/` (prod).
 */
export async function runMigrations(db: Db = getDb()): Promise<void> {
  await migrate(db, { migrationsFolder: findMigrationsFolder() });
}

function findMigrationsFolder(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const candidate = path.join(dir, "drizzle");
    if (existsSync(path.join(candidate, "meta", "_journal.json"))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("Could not locate drizzle migrations folder");
}
