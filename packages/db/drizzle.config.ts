import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for @folio/db.
 *
 * Targets Supabase-hosted Postgres through `SUPABASE_DATABASE_URL`.
 * `db:generate` does not require a live connection but `db:migrate` does.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.SUPABASE_DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
});
