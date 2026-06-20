import { ChapterPanel } from "@/components/review/chapter-panel";
import { DiffViewer } from "@/components/review/diff-viewer";
import { PrHeader } from "@/components/review/pr-header";
import { TopBar } from "@/components/review/top-bar";

// TODO(data): fetch the PR + chapter from the NestJS backend using these params
// instead of the sample fixtures. The route shape is Folio's deep-link format.
export default function ChapterReviewPage() {
  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <TopBar />
      <PrHeader />
      {/* Two-pane review on desktop; stacked review on narrow screens. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ChapterPanel />
        <DiffViewer />
      </div>
    </div>
  );
}
