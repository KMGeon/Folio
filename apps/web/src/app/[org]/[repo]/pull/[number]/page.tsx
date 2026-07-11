import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { ReviewView } from "@/components/review/review-view";
import { MissingReviewPrompt } from "@/components/review/missing-review-prompt";
import { ApiError } from "@/lib/api-client";
import { getMe } from "@/lib/auth";
import { type ReviewPayload, fetchReview } from "@/lib/review-api";

// The backend is unavailable at build time, so never statically prerender this.
export const dynamic = "force-dynamic";

export default async function PrOverviewPage({
  params,
}: {
  params: Promise<{ org: string; repo: string; number: string }>;
}) {
  const { org, repo, number } = await params;
  // Server-component fetch: forward the session cookie (credentials:"include" is browser-only).
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let review: ReviewPayload | null = null;
  try {
    review = await fetchReview(org, repo, Number(number), { cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/login?redirect=/${org}/${repo}/pull/${number}`);
    }
    if (!(err instanceof ApiError) || err.status !== 404) {
      throw err;
    }
  }

  const user = await getMe(cookieHeader);

  if (!review) {
    return (
      <AppLayout user={user} breadcrumb={{ org, repo, number: Number(number) }}>
        <MissingReviewPrompt org={org} repo={repo} number={Number(number)} />
      </AppLayout>
    );
  }

  return (
    <AppLayout user={user} breadcrumb={{ org, repo, number: Number(number) }}>
      <ReviewView
        pr={review.pr}
        prologue={review.prologue}
        chapters={review.chapters}
        comments={review.comments}
        commits={review.commits}
        commitsTruncated={review.commitsTruncated}
      />
    </AppLayout>
  );
}
