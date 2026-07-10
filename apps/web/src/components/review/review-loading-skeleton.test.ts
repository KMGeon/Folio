import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("ReviewLoadingSkeleton source", () => {
  it("mirrors the review overview while a missing review is generated", () => {
    const skeleton = readFileSync(resolve(__dirname, "review-loading-skeleton.tsx"), "utf8");
    const loading = readFileSync(
      resolve(__dirname, "../../app/[org]/[repo]/pull/[number]/loading.tsx"),
      "utf8",
    );

    expect(skeleton).toContain("export function ReviewLoadingSkeleton");
    expect(skeleton).toContain("AI 리뷰 생성 중");
    expect(skeleton).toContain("ReviewTopBarSkeleton");
    expect(skeleton).toContain("ReviewPrologueSkeleton");
    expect(skeleton).toContain("ReviewChapterCardsSkeleton");
    expect(skeleton).toContain("ReviewActivitySkeleton");
    expect(loading).toContain("ReviewLoadingSkeleton");
    expect(loading).toContain('import { AppLayout } from "@/components/app-layout"');
    expect(loading).toContain("<AppLayout user={null}>");
    expect(loading).toContain("<ReviewLoadingSkeleton />");
  });
});
