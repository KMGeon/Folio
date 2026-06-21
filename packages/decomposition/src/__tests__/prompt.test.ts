import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, buildUserPrompt } from "../prompt.js";

const HINT =
  "이 PR은 작지만 반드시 어떤 작업 또는 기능 변경인지 설명하는 Stage 제목과 요약을 작성한다.";

describe("prompt language and stage rules", () => {
  it("requires Korean output and task/function stages in the system prompt", () => {
    expect(SYSTEM_PROMPT).toContain("반드시 한국어");
    expect(SYSTEM_PROMPT).toContain("작은 Task 또는 기능 단위");
    expect(SYSTEM_PROMPT).toContain("파일 하나당 하나의 Stage를 만들지 않는다");
  });

  it("omits the hint when smallPrHunkCount is undefined", () => {
    const out = buildUserPrompt({ diff: "FORMATTED_DIFF", prTitle: "x" }, "FORMATTED_DIFF");
    expect(out).not.toContain(HINT);
    expect(out).toContain("## Task");
    expect(out).toContain("FORMATTED_DIFF");
  });

  it("includes the hint with the hunk count when smallPrHunkCount is set", () => {
    const out = buildUserPrompt({ diff: "FORMATTED_DIFF", prTitle: "x" }, "FORMATTED_DIFF", 2);
    expect(out).toContain("이 PR은 작은 변경입니다. reviewable hunk 수: 2.");
    expect(out).toContain(HINT);
  });
});
