import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReviewTopBar } from "./review-top-bar.js";

globalThis.React = React;

describe("ReviewTopBar", () => {
  it("uses semantic colors for draft status and branch labels", () => {
    const markup = renderToStaticMarkup(
      <ReviewTopBar
        pr={{
          org: "acme",
          repo: "widget",
          number: 7,
          title: "PR",
          body: "",
          status: "draft",
          author: "octo",
          htmlUrl: "https://github.com/acme/widget/pull/7",
          headSha: "abcdef123456",
          headBranch: "feature",
          baseBranch: "main",
        }}
        activeTab="chapters"
        onTabChange={() => undefined}
        chapterCount={1}
        fileCount={1}
        viewedFiles={0}
        totalFiles={1}
        totalAdditions={1}
        totalDeletions={0}
      />,
    );

    expect(markup).toContain("bg-warning/15");
    expect(markup).toContain("text-warning");
    expect(markup).toContain("bg-info/15");
    expect(markup).toContain("text-info");
    expect(markup).toContain("bg-primary/15");
    expect(markup).toContain("text-primary");
    expect(markup).toContain("shrink-0 px-4 py-4 md:px-6");
    expect(markup).toContain("flex min-w-0 flex-col gap-2.5");
    expect(markup).toContain("mt-3 flex flex-wrap items-center gap-x-3 gap-y-2");
    expect(markup).toContain("mt-4 flex items-center justify-between");
  });
});
