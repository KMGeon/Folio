// Prologue helpers. On the LLM path the prologue arrives inside the tool output
// (validated by PrologueSchema). This module owns the DETERMINISTIC prologue used
// by the fallback path so `decomposeDeterministic` still returns a structurally
// valid, useful prologue (motivation/outcome/keyChanges/focusAreas/complexity)
// with no model call.

import type {
  Complexity,
  FocusArea,
  Prologue,
  PrologueKeyChange,
  PullRequestFile,
} from "@folio/types";
import { COMPLEXITY_LEVEL, FOCUS_AREA_SEVERITY, FOCUS_AREA_TYPE } from "@folio/types";
import type { DecompositionInput } from "./types.js";

function countHunks(files: PullRequestFile[]): number {
  let n = 0;
  for (const f of files) {
    n += f.hunks.length;
  }
  return n;
}

function deriveComplexity(files: PullRequestFile[]): Complexity {
  const hunks = countHunks(files);
  const fileCount = files.length;
  let level: Complexity["level"] = COMPLEXITY_LEVEL.LOW;
  if (fileCount > 15 || hunks > 40) {
    level = COMPLEXITY_LEVEL.VERY_HIGH;
  } else if (fileCount > 8 || hunks > 20) {
    level = COMPLEXITY_LEVEL.HIGH;
  } else if (fileCount > 3 || hunks > 6) {
    level = COMPLEXITY_LEVEL.MEDIUM;
  }
  return {
    level,
    reasoning: `${fileCount} file${fileCount === 1 ? "" : "s"} changed across ${hunks} hunk${hunks === 1 ? "" : "s"}.`,
  };
}

function deriveKeyChanges(files: PullRequestFile[]): PrologueKeyChange[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const slash = f.path.indexOf("/");
    dirs.add(slash === -1 ? "(root)" : f.path.slice(0, slash));
  }
  const dirList = [...dirs].slice(0, 3).join(", ");
  const items: PrologueKeyChange[] = [
    {
      summary: "Files changed across the pull request",
      description: `Touches ${files.length} file${files.length === 1 ? "" : "s"} in ${dirList || "the repository"}.`,
    },
    {
      summary: "Deterministic decomposition was applied",
      description:
        "Chapters were grouped heuristically without a language-model pass; review groupings may be coarse.",
    },
  ];
  return items;
}

function deriveFocusAreas(files: PullRequestFile[]): FocusArea[] {
  const hasTests = files.some(
    (f) => /(?:^|\/)(?:__tests__|tests?)\//.test(f.path) || /\.(?:test|spec)\./.test(f.path),
  );
  const areas: FocusArea[] = [];
  if (!hasTests && files.length > 1) {
    areas.push({
      type: FOCUS_AREA_TYPE.TESTING_GAP,
      severity: FOCUS_AREA_SEVERITY.INFO,
      title: "No test changes detected",
      description:
        "This change does not appear to touch tests — confirm the new behavior is covered elsewhere.",
      locations: files.slice(0, 5).map((f) => f.path),
    });
  }
  areas.push({
    type: FOCUS_AREA_TYPE.ARCHITECTURE,
    severity: FOCUS_AREA_SEVERITY.INFO,
    title: "Heuristic grouping",
    description:
      "Chapters were grouped by directory without semantic analysis — verify related changes were not split across chapters.",
    locations: files.slice(0, 5).map((f) => f.path),
  });
  return areas.slice(0, 5);
}

/**
 * Produce a deterministic, schema-valid prologue from the parsed diff + PR
 * metadata. Motivation/outcome stay null unless a PR title is provided.
 */
export function buildFallbackPrologue(
  input: DecompositionInput,
  files: PullRequestFile[],
): Prologue {
  const title = input.prTitle?.trim();
  return {
    motivation: title ? `Pull request: ${title}` : null,
    outcome: null,
    diagram: null,
    keyChanges: deriveKeyChanges(files),
    focusAreas: deriveFocusAreas(files),
    complexity: deriveComplexity(files),
  };
}
