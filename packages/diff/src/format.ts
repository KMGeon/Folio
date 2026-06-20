import type { Hunk, LineType, PullRequestFile } from "@folio/types";
import { LINE_TYPE } from "@folio/types";
import { MAX_DIFF_CHARS, truncateForLlm } from "./truncate.js";

const LINE_PREFIX: Partial<Record<LineType, string>> = {
  [LINE_TYPE.ADDITION]: "+",
  [LINE_TYPE.DELETION]: "-",
};

/** Format a hunk as plain unified-diff body (no line-number columns). */
export function formatHunkDiff(hunk: Hunk): string {
  return hunk.lines.map((line) => `${LINE_PREFIX[line.type] ?? " "}${line.content}`).join("\n");
}

/**
 * Format a hunk with padded old/new line-number columns so the LLM reads
 * numbers rather than counting lines:
 *   `<oldNum> <newNum> |<prefix><content>`
 */
export function formatHunkDiffWithLineNumbers(hunk: Hunk): string {
  const maxOld = hunk.oldStart + Math.max(hunk.oldLines - 1, 0);
  const maxNew = hunk.newStart + Math.max(hunk.newLines - 1, 0);
  const colWidth = Math.max(String(maxOld).length, String(maxNew).length);

  return hunk.lines
    .map((line) => {
      const prefix = LINE_PREFIX[line.type] ?? " ";
      const oldNum =
        line.oldLineNumber != null
          ? String(line.oldLineNumber).padStart(colWidth)
          : " ".repeat(colWidth);
      const newNum =
        line.newLineNumber != null
          ? String(line.newLineNumber).padStart(colWidth)
          : " ".repeat(colWidth);
      return `${oldNum} ${newNum} |${prefix}${line.content}`;
    })
    .join("\n");
}

export function countHunkLines(hunk: Hunk): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const line of hunk.lines) {
    if (line.type === LINE_TYPE.ADDITION) {
      added++;
    } else if (line.type === LINE_TYPE.DELETION) {
      deleted++;
    }
  }
  return { added, deleted };
}

export interface FormatDiffOptions {
  maxChars?: number;
  withLineNumbers?: boolean;
}

export interface FormatDiffResult {
  text: string;
  truncated: boolean;
  droppedChars: number;
}

/**
 * Build the `=== HUNKS ===`-style block fed to Claude. Emits a header line
 * once per hunk:
 *   `=== File: <path> (<status>) | filePath: "<path>", oldStart: <N> ===`
 * followed by the line-numbered (or plain) hunk body. The header tuple is the
 * exact `(filePath, oldStart)` contract the agent must echo back as a
 * `HunkReference`. Honors `MAX_DIFF_CHARS` (or `opts.maxChars`).
 */
export function formatDiffForLlm(
  files: PullRequestFile[],
  opts: FormatDiffOptions = {},
): FormatDiffResult {
  const { maxChars = MAX_DIFF_CHARS, withLineNumbers = true } = opts;
  const formatHunk = withLineNumbers ? formatHunkDiffWithLineNumbers : formatHunkDiff;

  const blocks: string[] = [];
  for (const file of files) {
    for (const hunk of file.hunks) {
      const header = `=== File: ${file.path} (${file.status}) | filePath: "${file.path}", oldStart: ${hunk.oldStart} ===`;
      const body = formatHunk(hunk);
      blocks.push(body ? `${header}\n${body}` : header);
    }
  }

  const full = blocks.join("\n");
  return truncateForLlm(full, maxChars);
}
