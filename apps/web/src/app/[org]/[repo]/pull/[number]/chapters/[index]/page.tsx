import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { ReviewView } from "@/components/review/review-view";
import { ApiError } from "@/lib/api-client";
import { getMe } from "@/lib/auth";
import { type ReviewPayload, fetchReview } from "@/lib/review-api";

// Prevent Next.js from attempting a static fetch at build time — the backend is not available then.
export const dynamic = "force-dynamic";

export default async function ChapterReviewPage({
  params,
}: {
  params: Promise<{ org: string; repo: string; number: string; index: string }>;
}) {
  const { org, repo, number, index } = await params;
  // This runs on the Next server, where credentials:"include" does not attach
  // cookies — forward the incoming session cookie so the API call is authed.
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let review: ReviewPayload;
  try {
    review = await fetchReview(org, repo, Number(number), { cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/login?redirect=/${org}/${repo}/pull/${number}/chapters/${index}`);
    }
    throw err;
  }
  const user = await getMe(cookieHeader);
  if (!review.chapters.some((c) => c.index === Number(index))) {
    notFound();
  }

  return (
    <AppLayout user={user} breadcrumb={{ org, repo, number: Number(number) }}>
      {/* ReviewView owns the PR header, tabs, the graph+cards overview, and in-place diff. */}
      <ReviewView
        pr={review.pr}
        chapters={review.chapters}
        comments={review.comments}
        commits={review.commits}
      />
    </AppLayout>
  );
}
