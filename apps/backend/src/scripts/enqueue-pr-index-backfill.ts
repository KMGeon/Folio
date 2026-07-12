import "reflect-metadata";
import "../config.js";
import { closeDb } from "@folio/db";
import { BoardEventHub } from "../application/dashboard/board-event-hub.js";
import { enqueueBackfillForEnabledRepositories } from "../application/dashboard/pull-request-index-backfill-all.js";
import { PullRequestIndexBackfill } from "../application/dashboard/pull-request-index-backfill.js";
import { PullRequestIndexWriter } from "../application/dashboard/pull-request-index-writer.js";

async function main(): Promise<void> {
  const hub = new BoardEventHub();
  const writer = new PullRequestIndexWriter(hub);
  const backfill = new PullRequestIndexBackfill(writer, hub);
  const result = await enqueueBackfillForEnabledRepositories(backfill);
  console.log(`[folio] PR index backfill jobs enqueued: ${result.enqueued}`);
  console.log(`[folio] repositories already ready: ${result.skippedReady}`);
}

try {
  await main();
} finally {
  await closeDb();
}
