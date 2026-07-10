import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReviewTopBar } from "./review-top-bar.js";

globalThis.React = React;

describe("ReviewTopBar", () => {
  it("uses the secondary surface for draft status and branch labels", () => {
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

    expect(markup.match(/bg-secondary/g)).toHaveLength(3);
  });
});
