import { AppLayout } from "@/components/app-layout";
import { ReviewLoadingSkeleton } from "@/components/review/review-loading-skeleton";

export default function PullReviewLoading() {
  // The shell stays mounted so desktop navigation does not disappear during a review transition.
  return (
    <AppLayout user={null}>
      <ReviewLoadingSkeleton />
    </AppLayout>
  );
}
