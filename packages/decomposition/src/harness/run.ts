#!/usr/bin/env node
// Offline quality harness — bin `folio-decompose-eval`. Loads every
// `fixtures/*.diff` (+ optional `<name>.meta.json` hints), runs `decompose`, and
// asserts 100% hunk coverage + schema validity, printing a per-fixture report
// (chapter count, source, titles, timing). Exits non-zero if any fixture fails.
//
//   folio-decompose-eval [--no-llm] [--fixtures <dir>]
//
// `--no-llm` (and the absence of ANTHROPIC_API_KEY) exercises the deterministic
// fallback only, so CI is fully reproducible without the network.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { filterFilesForLlm, parseUnifiedDiff, validateHunkCoverage } from "@folio/diff";
import { ChapterSchema, PrologueSchema } from "@folio/types";
import { z } from "zod";
import { decompose, decomposeDeterministic } from "../decompose.js";
import type { DecompositionInput, DecompositionResult } from "../types.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FIXTURES = path.resolve(HERE, "../../fixtures");

const MetaSchema = z.object({
  prTitle: z.string().optional(),
  prBody: z.string().nullable().optional(),
  files: z.array(z.string()).optional(),
  commits: z.array(z.object({ sha: z.string(), message: z.string() })).optional(),
});

interface CliArgs {
  noLlm: boolean;
  fixturesDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  let noLlm = false;
  let fixturesDir = DEFAULT_FIXTURES;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-llm") {
      noLlm = true;
    } else if (arg === "--fixtures") {
      const next = argv[i + 1];
      if (next) {
        fixturesDir = path.resolve(next);
        i += 1;
      }
    }
  }
  return { noLlm, fixturesDir };
}

function loadMeta(diffPath: string): Partial<DecompositionInput> {
  const metaPath = diffPath.replace(/\.diff$/, ".meta.json");
  try {
    const raw = JSON.parse(readFileSync(metaPath, "utf8"));
    const parsed = MetaSchema.parse(raw);
    return {
      prTitle: parsed.prTitle,
      prBody: parsed.prBody ?? undefined,
      files: parsed.files,
      commits: parsed.commits,
    };
  } catch {
    return {};
  }
}

interface FixtureReport {
  name: string;
  ok: boolean;
  source: DecompositionResult["source"];
  chapterCount: number;
  titles: string[];
  ms: number;
  error?: string;
}

/** Validate a result's structural + coverage guarantees. Throws on failure. */
function assertValid(input: DecompositionInput, result: DecompositionResult): void {
  for (const chapter of result.chapters) {
    ChapterSchema.parse(chapter);
  }
  if (result.prologue !== null) {
    PrologueSchema.parse(result.prologue);
  }
  const allFiles = parseUnifiedDiff(input.diff);
  // Coverage is enforced over ALL files (reviewable + excluded catch-all).
  validateHunkCoverage(allFiles, result.chapters);
  // Sanity: at least one chapter when there are any files.
  const { files: reviewable } = filterFilesForLlm(allFiles);
  if (reviewable.length > 0 && result.chapters.length === 0) {
    throw new Error("Reviewable hunks present but no chapters produced");
  }
}

async function runFixture(name: string, diffPath: string, noLlm: boolean): Promise<FixtureReport> {
  const diff = readFileSync(diffPath, "utf8");
  const input: DecompositionInput = { diff, ...loadMeta(diffPath) };
  const started = Date.now();
  try {
    const result = noLlm ? decomposeDeterministic(input) : await decompose(input);
    assertValid(input, result);
    return {
      name,
      ok: true,
      source: result.source,
      chapterCount: result.chapters.length,
      titles: result.chapters.map((c) => c.title),
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      name,
      ok: false,
      source: "fallback",
      chapterCount: 0,
      titles: [],
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const entries = readdirSync(args.fixturesDir)
    .filter((f) => f.endsWith(".diff"))
    .sort();

  if (entries.length === 0) {
    process.stderr.write(`No .diff fixtures found in ${args.fixturesDir}\n`);
    return 1;
  }

  process.stdout.write(
    `folio-decompose-eval — ${entries.length} fixtures (${args.noLlm ? "no-llm" : "llm-if-key"})\n\n`,
  );

  const reports: FixtureReport[] = [];
  for (const entry of entries) {
    const report = await runFixture(entry, path.join(args.fixturesDir, entry), args.noLlm);
    reports.push(report);
    const status = report.ok ? "PASS" : "FAIL";
    process.stdout.write(
      `[${status}] ${report.name}  source=${report.source}  chapters=${report.chapterCount}  ${report.ms}ms\n`,
    );
    for (const title of report.titles) {
      process.stdout.write(`         • ${title}\n`);
    }
    if (report.error) {
      process.stdout.write(`         ! ${report.error}\n`);
    }
  }

  const failed = reports.filter((r) => !r.ok);
  process.stdout.write(`\n${reports.length - failed.length}/${reports.length} fixtures passed.\n`);
  return failed.length === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
    process.exitCode = 1;
  });
