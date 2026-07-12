import { cn } from "@/lib/utils";
import type { DashboardScopeCounts } from "./dashboard-project-desk-model";

export type DashboardHeaderCounts = DashboardScopeCounts;

export function DashboardHeader({
  login,
  avatarUrl,
  counts,
  scopeName,
}: {
  login: string;
  avatarUrl: string;
  counts: DashboardHeaderCounts;
  scopeName: string;
}) {
  return (
    <header className="space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            referrerPolicy="no-referrer"
            className="size-9 shrink-0 rounded-[11px] border border-border object-cover"
          />
          <div className="min-w-0">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              리뷰 데스크
            </p>
            <h1 className="truncate font-sans text-lg font-medium leading-tight tracking-tight md:text-xl">
              Welcome back, <span className="font-normal text-primary/90">{login}</span>
            </h1>
          </div>
        </div>

        <div
          className="flex w-fit max-w-full flex-wrap items-center gap-0.5 rounded-full border border-border bg-card/70 p-1"
          role="group"
          aria-label="Desk metrics"
        >
          <MetricChip label="Attention" value={counts.attention} tone="attention" />
          <MetricChip label="Ready" value={counts.ready} tone="ready" />
          <MetricChip label="Reviewing" value={counts.reviewing} />
          <MetricChip label="Processing" value={counts.processing} tone="processing" />
          <MetricChip label="Complete" value={counts.complete} />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground sm:pl-12">
        {dashboardHeaderStandfirst(counts, scopeName)}
      </p>
    </header>
  );
}

function MetricChip({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "attention" | "ready" | "processing" | "default";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground",
        tone === "attention" && "bg-destructive/10 text-destructive",
        tone === "ready" && "bg-primary/12 text-primary",
        tone === "processing" && "bg-info/10 text-info",
      )}
    >
      <span>{label}</span>
      <strong
        className={cn(
          "font-medium tabular-nums text-foreground",
          tone === "attention" && "text-destructive",
          tone === "ready" && "text-primary",
          tone === "processing" && "text-info",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

/** Status-aware standfirst so the masthead reflects the queue, not a fixed slogan. */
export function dashboardHeaderStandfirst(
  counts: DashboardHeaderCounts,
  scopeName = "All projects",
): string {
  if (counts.attention > 0) {
    return `${scopeName} 범위에 확인 필요 ${counts.attention}건이 있습니다. 재시도하거나 변경사항을 확인하세요.`;
  }
  if (counts.ready > 0) {
    return `${scopeName} 범위에 리뷰 ${counts.ready}건이 대기 중입니다. 챕터 순서로 읽어 내려가세요.`;
  }
  if (counts.reviewing > 0) {
    return `${scopeName} 범위에 진행 중인 리뷰 ${counts.reviewing}건이 있습니다. 이어서 확인하세요.`;
  }
  if (counts.processing > 0) {
    return `${scopeName} 범위에 준비 중인 PR ${counts.processing}건이 있습니다. Folio가 챕터를 생성하고 있습니다.`;
  }
  if (counts.complete > 0) {
    return `${scopeName} 범위에는 대기 중인 리뷰가 없습니다. 최근 완료 작업을 확인하세요.`;
  }
  return `${scopeName} 범위의 풀리퀘스트를 챕터 순서로 읽어 내려가며 리뷰하세요.`;
}
