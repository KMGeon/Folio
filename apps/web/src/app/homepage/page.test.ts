import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("HomepagePage", () => {
  it("renders Folio's public product story and GitHub CTA", async () => {
    const source = [
      await readFile(new URL("./page.tsx", import.meta.url), "utf8"),
      await readFile(new URL("./homepage-sections.tsx", import.meta.url), "utf8"),
      await readFile(new URL("./live-review-board.tsx", import.meta.url), "utf8"),
      await readFile(new URL("./homepage-data.ts", import.meta.url), "utf8"),
    ].join("\n");

    expect(source).toContain("PR을 읽는 순서까지 설계하는 리뷰 워크스페이스");
    expect(source).toContain("PR이 챕터로 정렬되는 과정");
    expect(source).toContain("GitHub로 시작하기");
    expect(source).toContain("챕터 기반 리뷰");
    expect(source).toContain("오픈베타 기간에는 모든 팀이 무료로 사용할 수 있습니다.");
    expect(source).toContain("Team");
    expect(source).toContain("$30");
  });
});
