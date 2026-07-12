import { runMigrations } from "@folio/db";

/**
 * Apply Drizzle SQL migrations before serving traffic or claiming jobs.
 * Safe to call from multiple processes: Drizzle tracks applied tags in its
 * journal table and no-ops already-applied migrations.
 */
export async function applyPendingMigrations(label: string): Promise<void> {
  console.log(`[folio] ${label}: applying pending database migrations`);
  await runMigrations();
  console.log(`[folio] ${label}: database migrations up to date`);
}
