import { cn } from "@/lib/utils";

export interface DashboardHeaderCounts {
  ready: number;
  yours: number;
  completed: number;
}

export function DashboardHeader({
  login,
  avatarUrl,
  counts,
}: {
  login: string;
  avatarUrl: string;
  counts: DashboardHeaderCounts;
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
          className="inline-flex w-fit items-center gap-0.5 rounded-full border border-border bg-card/70 p-1"
          role="group"
          aria-label="Desk metrics"
        >
          <MetricChip label="Ready" value={counts.ready} emphasis />
          <MetricChip label="Yours" value={counts.yours} />
          <MetricChip label="Done" value={counts.completed} />
        </div>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground sm:pl-12">
        {dashboardHeaderStandfirst(counts)}
      </p>
    </header>
  );
}

function MetricChip({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground",
        emphasis && "bg-primary/12 text-primary",
      )}
    >
      <span>{label}</span>
      <strong
        className={cn("font-medium tabular-nums text-foreground", emphasis && "text-primary")}
      >
        {value}
      </strong>
    </div>
  );
}

/** Status-aware standfirst so the masthead reflects the queue, not a fixed slogan. */
export function dashboardHeaderStandfirst(counts: DashboardHeaderCounts): string {
  if (counts.ready > 0) {
    return `리뷰 ${counts.ready}건이 대기 중입니다. 챕터 순서로 읽어 내려가세요.`;
  }
  if (counts.yours > 0) {
    return `열린 PR ${counts.yours}건이 있습니다. 상태를 확인하세요.`;
  }
  if (counts.completed > 0) {
    return "오늘은 대기 중인 리뷰가 없습니다. 최근 완료 작업을 확인하세요.";
  }
  return "풀리퀘스트를 챕터 순서로 읽어 내려가며 리뷰하세요.";
}
