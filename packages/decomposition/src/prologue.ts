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
    reasoning: `${fileCount}개 파일에서 ${hunks}개 hunk가 변경되었습니다.`,
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
      summary: "PR 전체 변경 파일 정리",
      description: `${dirList || "저장소"} 영역에서 ${files.length}개 파일이 변경되었습니다.`,
    },
    {
      summary: "파일 작업 기준 Stage 생성",
      description: "모델 없이 파일 작업 기준으로 Stage를 생성했습니다.",
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
      title: "테스트 변경 없음",
      description:
        "테스트 파일 변경이 보이지 않습니다. 새 동작이 다른 곳에서 검증되는지 확인하세요.",
      locations: files.slice(0, 5).map((f) => f.path),
    });
  }
  areas.push({
    type: FOCUS_AREA_TYPE.ARCHITECTURE,
    severity: FOCUS_AREA_SEVERITY.INFO,
    title: "파일 기준 Stage",
    description:
      "모델 없이 파일 기준으로 Stage를 나눴습니다. 서로 강하게 연결된 변경이 분리되지 않았는지 확인하세요.",
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
    motivation: title ? `PR 제목: ${title}` : null,
    outcome: null,
    diagram: null,
    keyChanges: deriveKeyChanges(files),
    focusAreas: deriveFocusAreas(files),
    complexity: deriveComplexity(files),
  };
}
