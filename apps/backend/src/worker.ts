/**
 * Folio decomposition worker (stub entrypoint).
 *
 * In production this process claims decomposition jobs from a Postgres queue
 * (FOR UPDATE SKIP LOCKED), runs the PR -> chapters decomposition via the
 * Codex SDK (config.FOLIO_DECOMP_MODEL), and writes results back.
 *
 * TODO(I2): claim jobs from the SKIP-LOCKED queue and run decomposition.
 */
console.log("[folio] worker started (decomposition queue not yet implemented)");

// Keep the process alive with a heartbeat until the real loop lands.
setInterval(() => {
  console.log(`[folio] worker heartbeat ${new Date().toISOString()}`);
}, 30_000);
