import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { RiskPill, StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { DASHBOARD_PULLS, PR } from "@/lib/sample-review";

export default function DashboardPage() {
  const ready = DASHBOARD_PULLS.filter((pull) => pull.status === "ready");
  const processing = DASHBOARD_PULLS.filter((pull) => pull.status === "processing");

  return (
    <AppShell active="대시보드">
      <div className="flex min-h-svh flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
          <div>
            <h1 className="text-base font-semibold">대시보드</h1>
            <p className="text-xs text-muted-foreground">챕터로 분해된 PR을 빠르게 검토합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline">
              <RefreshCw className="size-4" />
              동기화
            </Button>
            <Button size="sm">
              <Plus className="size-4" />앱 설치
            </Button>
          </div>
        </header>

        <div className="grid gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-6">
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="리뷰 준비" value="12" icon={CheckCircle2} />
              <Metric label="처리 중" value="3" icon={Clock3} />
              <Metric label="설치된 repo" value="8" icon={GitBranch} />
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
                {ready.map((pull) => (
                  <PullRow key={pull.id} pull={pull} />
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3">
                <h2 className="text-sm font-semibold">Processing</h2>
                <p className="text-xs text-muted-foreground">Webhook 수신 후 챕터 생성 중인 PR</p>
              </div>
              <div className="grid gap-2">
                {processing.map((pull) => (
                  <PullRow key={pull.id} pull={pull} />
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold">Open in Folio</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                GitHub PR에 Folio bot 댓글과 Check Run을 남기고, 버튼으로 이 리뷰 화면을 엽니다.
              </p>
              <Button asChild className="mt-4 w-full" size="sm">
                <Link href={`/${PR.org}/${PR.repo}/pull/${PR.number}/chapters/2`}>
                  샘플 PR 열기
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <div className="text-sm font-semibold">Repository Access</div>
              <div className="mt-3 space-y-2 text-sm">
                <RepoLine name="stablyai/orca" count={7} />
                <RepoLine name="KMGeon/Folio" count={3} />
                <RepoLine name="folio-labs/review-demo" count={2} />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
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

function PullRow({ pull }: { pull: (typeof DASHBOARD_PULLS)[number] }) {
  const progress =
    pull.chapterCount > 0 ? Math.round((pull.viewedChapters / pull.chapterCount) * 100) : 0;
  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}/chapters/2`}
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
