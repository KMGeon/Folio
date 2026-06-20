// Assemble the wire-shaped `Chapter[]` (@folio/types) the rest of Folio consumes
// from the engine's strict emit chapters plus any catch-all bucket. The engine
// speaks the model emit shape (id/order/title/summary/hunkRefs/keyChanges);
// the wire shape adds externalId/prId/revisionId, a LexoRank `order`, and the
// (initially empty) reviewHints[]/risks[] + draft status. This module is the
// single place that bridges the two so I2 persistence gets a consistent shape.

import type { Chapter, ChapterEmit, KeyChange, KeyChangeEmit, LexoRank } from "@folio/types";
import { CHAPTER_STATUS } from "@folio/types";
import type { CatchAllChapter } from "./other-changes.js";

/**
 * Deterministic, evenly-spaced LexoRank for position `index` (0-based). Buckets
 * of base-36 keep them lexicographically ordered with room to insert later.
 */
function lexoRank(index: number): LexoRank {
  // "0|" prefix mirrors common LexoRank bucket notation; zero-padded base-36
  // suffix keeps string order aligned with numeric order for the sizes we emit.
  const suffix = (index + 1).toString(36).padStart(6, "0");
  return `0|${suffix}` as LexoRank;
}

function toKeyChange(kc: KeyChangeEmit, chapterId: string, idx: number): KeyChange {
  const externalId = `${chapterId}-kc-${idx + 1}`;
  return {
    id: externalId,
    externalId,
    content: kc.content,
    lineRefs: kc.lineRefs,
  };
}

interface AssembleContext {
  prId: string;
  revisionId: string;
}

const DEFAULT_CONTEXT: AssembleContext = { prId: "", revisionId: "" };

/** Convert one engine emit chapter to the wire `Chapter` at reading position `index`. */
function emitToChapter(chapter: ChapterEmit, index: number, ctx: AssembleContext): Chapter {
  return {
    id: chapter.id,
    externalId: chapter.id,
    prId: ctx.prId,
    revisionId: ctx.revisionId,
    order: lexoRank(index),
    title: chapter.title,
    summary: chapter.summary,
    hunkRefs: chapter.hunkRefs,
    keyChanges: chapter.keyChanges.map((kc, i) => toKeyChange(kc, chapter.id, i)),
    reviewHints: [],
    risks: [],
    status: CHAPTER_STATUS.DRAFT,
  };
}

/** Convert a deterministic catch-all bucket to a wire `Chapter`. */
function catchAllToChapter(bucket: CatchAllChapter, index: number, ctx: AssembleContext): Chapter {
  return {
    id: bucket.id,
    externalId: bucket.id,
    prId: ctx.prId,
    revisionId: ctx.revisionId,
    order: lexoRank(index),
    title: bucket.title,
    summary: bucket.summary,
    hunkRefs: bucket.hunkRefs,
    keyChanges: [],
    reviewHints: [],
    risks: [],
    status: CHAPTER_STATUS.DRAFT,
  };
}

/**
 * Build the final ordered wire chapters. Emit chapters are sorted by their
 * `order` field; the optional catch-all bucket is always appended last so
 * lockfiles/leftovers sit at the end. `order` is re-derived as a fresh,
 * gap-free LexoRank sequence regardless of the model's numbering.
 */
export function assembleChapters(
  emitChapters: ChapterEmit[],
  catchAll: CatchAllChapter | null,
  ctx: AssembleContext = DEFAULT_CONTEXT,
): Chapter[] {
  const ordered = [...emitChapters].sort((a, b) => a.order - b.order);
  const out: Chapter[] = ordered.map((c, i) => emitToChapter(c, i, ctx));
  if (catchAll && catchAll.hunkRefs.length > 0) {
    out.push(catchAllToChapter(catchAll, out.length, ctx));
  }
  return out;
}
