import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { ChapterCards } from "@/components/review/chapter-cards";
import { CommitGraph } from "@/components/review/commit-graph";
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

  let review: ReviewPayload;
  try {
    review = await fetchReview(org, repo, Number(number), { cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect(`/login?redirect=/${org}/${repo}/pull/${number}`);
    }
    throw err;
  }

  const user = await getMe(cookieHeader);
  const prPath = `/${org}/${repo}/pull/${number}`;
  const totalAdditions = review.chapters.reduce(
    (sum, chapter) => sum + chapter.files.reduce((n, file) => n + file.additions, 0),
    0,
  );
  const totalDeletions = review.chapters.reduce(
    (sum, chapter) => sum + chapter.files.reduce((n, file) => n + file.deletions, 0),
    0,
  );

  return (
    <AppLayout user={user} breadcrumb={{ org, repo, number: Number(number) }}>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {review.pr.title}
            <span className="ml-2 font-normal text-muted-foreground">#{review.pr.number}</span>
          </h1>
          <span className="font-mono text-xs tabular-nums">
            <span className="text-diff-add-fg">+{totalAdditions}</span>{" "}
            <span className="text-diff-del-fg">-{totalDeletions}</span>
          </span>
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          {review.pr.author} · {review.commits.length} commits · {review.chapters.length} chapters
        </p>

        {/* The differentiator: construction flow (commits) beside review flow (chapters). */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              작업 흐름
            </h2>
            <div className="rounded-lg border bg-card p-2">
              <CommitGraph commits={review.commits} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              챕터
            </h2>
            <ChapterCards chapters={review.chapters} prPath={prPath} />
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
