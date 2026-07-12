import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AdminAnalyticsPayload } from "@folio/types";
import { AdminAnalyticsPanel } from "./admin-analytics-panel";

Object.assign(globalThis, { React });

const analytics: AdminAnalyticsPayload = {
  range: "7d",
  days: [
    {
      date: "2026-07-12",
      jobs: { succeeded: 4, failed: 1, dead: 0 },
      users: { created: 2 },
      workspaces: { created: 1, enabledRepositories: 1 },
      audit: { events: 3 },
    },
  ],
  distributions: {
    jobs: [{ key: "succeeded", value: 4 }],
    users: [{ key: "active", value: 2 }],
    installations: [{ key: "active", value: 1 }],
    audit: [{ key: "user_approve", value: 3 }],
    jobKinds: [{ key: "review_pull", value: 4 }],
  },
};

describe("AdminAnalyticsPanel", () => {
  it("renders a labeled trend, distribution, and data-empty baseline", () => {
    const html = renderToStaticMarkup(
      <AdminAnalyticsPanel analytics={analytics} section="operations" />,
    );

    expect(html).toContain("작업 처리 추이");
    expect(html).toContain("성공");
    expect(html).toContain("작업 상태 분포");
    expect(html).toContain('role="img"');
  });
});
