import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseUnifiedDiff } from "@folio/diff";
import type { ChapterEmit, HunkReference, PullRequestFile } from "@folio/types";
import type { ChapterClient, ChapterClientRequest } from "../client.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(HERE, "../../fixtures");

export function readFixture(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

/** Every reviewable + excluded hunk ref in a parsed diff. */
export function allHunkRefs(files: PullRequestFile[]): HunkReference[] {
  const refs: HunkReference[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      refs.push({ filePath: file.path, oldStart: hunk.oldStart });
    }
  }
  return refs;
}

/** Build a single valid emit chapter covering every reviewable-file hunk. */
export function fullCoverageChapter(diff: string, excludePaths: string[] = []): ChapterEmit {
  const files = parseUnifiedDiff(diff);
  const refs = allHunkRefs(files).filter((r) => !excludePaths.includes(r.filePath));
  return {
    id: "chapter-1",
    order: 1,
    title: "Apply the change",
    summary: "Covers every reviewable hunk in one chapter.",
    hunkRefs: refs,
    keyChanges: [],
  };
}

/**
 * A scripted stub `ChapterClient`. Each call shifts the next response off the
 * queue: a value is returned, a function is invoked with the request, an Error
 * is thrown. Records every request for assertions.
 */
export class StubClient implements ChapterClient {
  readonly model: string;
  readonly requests: ChapterClientRequest[] = [];
  private queue: (unknown | ((req: ChapterClientRequest) => unknown) | Error)[];

  constructor(
    responses: (unknown | ((req: ChapterClientRequest) => unknown) | Error)[],
    model = "stub-model",
  ) {
    this.queue = [...responses];
    this.model = model;
  }

  async emitChapters(req: ChapterClientRequest): Promise<unknown> {
    this.requests.push(req);
    const next = this.queue.shift();
    if (next instanceof Error) {
      throw next;
    }
    if (typeof next === "function") {
      return (next as (r: ChapterClientRequest) => unknown)(req);
    }
    if (next === undefined) {
      throw new Error("StubClient: no more scripted responses");
    }
    return next;
  }
}
