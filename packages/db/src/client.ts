import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.js";

export type Db = PostgresJsDatabase<typeof schema>;

interface CachedHandle {
  client: Sql;
  db: Db;
  connectionString: string;
}

let cached: CachedHandle | null = null;

function resolveConnectionString(explicit?: string): string {
  const connectionString = explicit ?? process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      [
        "SUPABASE_DATABASE_URL is not set.",
        "@folio/db requires a Postgres connection string",
        "for the Supabase-hosted database.",
      ].join(" "),
    );
  }
  return connectionString;
}

/**
 * Lazily create (and cache) a Drizzle handle over a singleton postgres-js client.
 * Cached database handle; reconnects if the connection
 * string changes (e.g. between tests).
 */
export function getDb(opts: { connectionString?: string } = {}): Db {
  const connectionString = resolveConnectionString(opts.connectionString);
  if (cached && cached.connectionString === connectionString) {
    return cached.db;
  }
  if (cached) {
    // Different target: close the old client before opening a new one.
    void cached.client.end({ timeout: 5 });
    cached = null;
  }

  // Supabase pooler modes can reject prepared statements; disabling them keeps
  // direct and pooled connection strings interchangeable.
  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });
  cached = { client, db, connectionString };
  return db;
}

/** Close the cached client (and clear the cache). Safe to call when none exists. */
export async function closeDb(): Promise<void> {
  if (!cached) {
    return;
  }
  const { client } = cached;
  cached = null;
  await client.end({ timeout: 5 });
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
