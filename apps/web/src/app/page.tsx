import { CheckCircle2, Clock3, GitBranch, GitPullRequest } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { ContributionsSkyline } from "@/components/three/contributions-skyline";
import { RiskPill, StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { getMe } from "@/lib/auth";
import { type DashboardPayload, type DashboardPull, fetchDashboard } from "@/lib/dashboard-api";

// Live dashboard: open PRs from installed repos, so always render dynamically.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let data: DashboardPayload;
  try {
    data = await fetchDashboard({ cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login?redirect=/");
    }
    throw err;
  }

  const ready = data.pulls.filter((pull) => pull.status === "ready");
  const processing = data.pulls.filter((pull) => pull.status === "processing");
  const user = await getMe(cookieHeader);

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
          <div>
            <h1 className="text-base font-semibold">대시보드</h1>
            <p className="text-xs text-muted-foreground">챕터로 분해된 PR을 빠르게 검토합니다.</p>
          </div>
        </header>

        <div className="space-y-6 p-4 md:p-6">
          <ContributionsSkyline activity={data.activity} />

          <div className="grid gap-3 md:grid-cols-3">
            <Metric label="리뷰 준비" value={String(data.metrics.ready)} icon={CheckCircle2} />
            <Metric label="처리 중" value={String(data.metrics.processing)} icon={Clock3} />
            <Metric
              label="설치된 repo"
              value={String(data.metrics.installedRepos)}
              icon={GitBranch}
            />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Needs Review</h2>
                <p className="text-xs text-muted-foreground">Folio가 챕터를 생성한 열린 PR</p>
              </div>
              <Button size="xs" variant="ghost">
                모두 보기
              </Button>
            </div>
            <div className="grid gap-2">
              {ready.length > 0 ? (
                ready.map((pull) => <PullRow key={pull.id} pull={pull} />)
              ) : (
                <EmptyHint text="챕터가 생성된 열린 PR이 아직 없습니다." />
              )}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Processing</h2>
              <p className="text-xs text-muted-foreground">Webhook 수신 후 챕터 생성 중인 PR</p>
            </div>
            <div className="grid gap-2">
              {processing.length > 0 ? (
                processing.map((pull) => <PullRow key={pull.id} pull={pull} />)
              ) : (
                <EmptyHint text="처리 중인 PR이 없습니다." />
              )}
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-sm font-semibold">Repository Access</h2>
              <p className="text-xs text-muted-foreground">Folio가 설치된 저장소</p>
            </div>
            {data.repos.length > 0 ? (
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {data.repos.map((repo) => (
                  <RepoLine key={repo.fullName} name={repo.fullName} count={repo.openPrCount} />
                ))}
              </div>
            ) : (
              <EmptyHint text="설치된 repository가 없습니다." />
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs">{label}</span>
        <Icon className="size-4" />
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/40 px-4 py-6 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}

function PullRow({ pull }: { pull: DashboardPull }) {
  const progress =
    pull.chapterCount > 0 ? Math.round((pull.viewedChapters / pull.chapterCount) * 100) : 0;
  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}/chapters/1`}
      className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/35"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {pull.org}/{pull.repo}#{pull.number}
            </span>
            <StatusPill status={pull.status} />
            <RiskPill risk={pull.risk} />
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold group-hover:text-primary">
            {pull.title}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <GitPullRequest className="size-3.5" />
              {pull.headBranch} → {pull.baseBranch}
            </span>
            <span>{pull.author}</span>
            <span>{pull.updatedAt}</span>
            <span>{pull.changedFiles} files</span>
          </div>
        </div>
        <div className="w-36 shrink-0">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>progress</span>
            <span>
              {pull.viewedChapters}/{pull.chapterCount || "-"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function RepoLine({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background/35 px-3 py-2">
      <span>{name}</span>
      <span className="text-xs text-muted-foreground">{count} PR</span>
    </div>
  );
}
