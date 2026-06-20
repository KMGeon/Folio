import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PullRequestFile } from "@folio/types";
import ignore, { type Ignore } from "ignore";

/** Lockfiles and generated artifacts excluded by exact (lowercased) basename. */
const IGNORED_FILENAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "composer.lock",
  "gemfile.lock",
  "cargo.lock",
  "poetry.lock",
  "pipfile.lock",
  "go.sum",
  "flake.lock",
  ".ds_store",
  "thumbs.db",
]);

/** Generated/minified/binary asset extensions excluded by suffix. */
const IGNORED_EXTENSIONS = [
  ".min.js",
  ".min.css",
  ".map",
  ".snap",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".mp4",
  ".webm",
  ".pdf",
] as const;

/** True when the file is reviewable (not a lockfile / generated / binary asset). */
export function shouldIncludeFile(filePath: string): boolean {
  const basename = (filePath.split("/").at(-1) ?? filePath).toLowerCase();
  if (IGNORED_FILENAMES.has(basename)) {
    return false;
  }
  const lowerPath = filePath.toLowerCase();
  return !IGNORED_EXTENSIONS.some((ext) => lowerPath.endsWith(ext));
}

/**
 * Load a `.folioignore` file from the repo root into an `Ignore` matcher.
 * Returns `null` when the file is absent. Comments, blank lines, negation, and
 * anchoring semantics all follow `.gitignore` via the `ignore` package.
 */
export function loadFolioIgnore(repoRoot: string): Ignore | null {
  const ignorePath = path.join(repoRoot, ".folioignore");
  if (!existsSync(ignorePath)) {
    return null;
  }
  return ignore().add(readFileSync(ignorePath, "utf8"));
}

export interface FilterFilesResult {
  files: PullRequestFile[];
  excludedByPath: string[];
}

/**
 * Partition files into reviewable vs excluded. A file is excluded when it is a
 * known lockfile/generated/binary path, or matched by the optional
 * `.folioignore` matcher.
 */
export function filterFilesForLlm(
  files: PullRequestFile[],
  folioIgnore?: Ignore | null,
): FilterFilesResult {
  const excludedByPath: string[] = [];
  const reviewable: PullRequestFile[] = [];

  for (const file of files) {
    if (!shouldIncludeFile(file.path) || folioIgnore?.ignores(file.path)) {
      excludedByPath.push(file.path);
      continue;
    }
    reviewable.push(file);
  }

  return { files: reviewable, excludedByPath };
}
