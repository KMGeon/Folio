import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("HomePage (site root)", () => {
  it("uses the compact application density scale", async () => {
    const [globals, buttons, layout] = await Promise.all([
      readFile(new URL("./globals.css", import.meta.url), "utf8"),
      readFile(new URL("../components/ui/button.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/app-layout.tsx", import.meta.url), "utf8"),
    ]);

    expect(globals).toContain("font-size: 13px");
    expect(buttons).toContain("rounded-md text-xs font-medium");
    expect(buttons).toContain('default: "h-8');
    expect(layout).toContain('<header className="flex h-12');
  });

  it("keeps public sections compact", async () => {
    const source = await readFile(
      new URL("./homepage/homepage-sections.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("py-16");
    expect(source).toContain("h-12 max-w-7xl");
  });

  it("reserves editorial serif type for the Folio wordmark", async () => {
    const contentSources = await Promise.all([
      readFile(new URL("./homepage/homepage-sections.tsx", import.meta.url), "utf8"),
      readFile(new URL("./dashboard/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("./login/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("./settings/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("./onboarding/install/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/dashboard/dashboard-board.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/legal-page.tsx", import.meta.url), "utf8"),
    ]);

    for (const source of contentSources) {
      const serifLines = source.split("\n").filter((line) => line.includes("font-serif"));
      expect(serifLines.every((line) => line.includes("Folio"))).toBe(true);
    }
  });

  it("renders Folio's public product story and GitHub CTA at the site root", async () => {
    const source = [
      await readFile(new URL("./page.tsx", import.meta.url), "utf8"),
      await readFile(new URL("./homepage/homepage-sections.tsx", import.meta.url), "utf8"),
      await readFile(new URL("./homepage/live-review-board.tsx", import.meta.url), "utf8"),
      await readFile(new URL("./homepage/homepage-data.ts", import.meta.url), "utf8"),
    ].join("\n");

    expect(source).toContain("PR을 읽는 순서까지 설계하는 리뷰 워크스페이스");
    expect(source).toContain("PR이 챕터로 정렬되는 과정");
    expect(source).toContain("GitHub로 시작하기");
    expect(source).toContain("챕터 기반 리뷰");
    expect(source).toContain("오픈베타 기간에는 모든 팀이 무료로 사용할 수 있습니다.");
    expect(source).toContain("Team");
    expect(source).toContain("$30");
    expect(source).toMatch(/<Button\s+className="mt-8 w-full"\s+disabled\s+type="button"/);
  });
});
