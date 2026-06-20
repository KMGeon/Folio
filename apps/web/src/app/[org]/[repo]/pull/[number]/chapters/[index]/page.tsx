import { notFound } from "next/navigation";

import { ChapterPanel } from "@/components/review/chapter-panel";
import { DiffViewer } from "@/components/review/diff-viewer";
import { PrHeader } from "@/components/review/pr-header";
import { TopBar } from "@/components/review/top-bar";
import { fetchReview } from "@/lib/review-api";

// Prevent Next.js from attempting a static fetch at build time — the backend is not available then.
export const dynamic = "force-dynamic";

export default async function ChapterReviewPage({
  params,
}: {
  params: Promise<{ org: string; repo: string; number: string; index: string }>;
}) {
  const { org, repo, number, index } = await params;
  const review = await fetchReview(org, repo, Number(number));
  const activeIndex = Number(index);
  const chapter = review.chapters.find((c) => c.index === activeIndex);
  if (!chapter) {
    notFound();
  }

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <TopBar pr={review.pr} />
      <PrHeader pr={review.pr} chapterCount={review.chapters.length} />
      {/* Two-pane review on desktop; stacked review on narrow screens. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ChapterPanel chapters={review.chapters} activeIndex={activeIndex} />
        <DiffViewer chapter={chapter} />
      </div>
    </div>
  );
}
