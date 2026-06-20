import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for @folio/db.
 *
 * Targets Postgres (F2 runs it on port 5433 in dev). `DATABASE_URL` is read
 * from the environment; `db:generate` does not require a live connection but
 * `db:migrate` does.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://folio:folio@localhost:5433/folio",
  },
  strict: true,
  verbose: true,
});
