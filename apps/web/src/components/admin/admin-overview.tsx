import type { AdminOverviewPayload } from "@folio/types";
import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";

export function AdminOverview({ payload }: { payload: AdminOverviewPayload }) {
  const pendingAttention = payload.attention.find((item) => item.kind === "pending_users");
  const suspendedAttention = payload.attention.find(
    (item) => item.kind === "suspended_installations",
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="승인 대기 사용자" value={payload.metrics.pendingUsers} />
        <Metric label="워크스페이스" value={payload.metrics.workspaces} />
        <Metric label="활성화된 저장소" value={payload.metrics.enabledRepositories} />
      </div>

      {pendingAttention ? (
        <Link
          href="/admin/users?status=pending"
          className="flex h-10 items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs text-primary transition-colors hover:bg-primary/15"
        >
          <Clock3 className="size-3.5" aria-hidden="true" />
          <span className="flex-1">승인 대기 사용자 {pendingAttention.count}명</span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}

      {suspendedAttention ? (
        <Link
          href="/admin/workspaces?installationState=suspended"
          className="flex h-10 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 text-xs text-destructive transition-colors hover:bg-destructive/15"
        >
          <Clock3 className="size-3.5" aria-hidden="true" />
          <span className="flex-1">정지된 GitHub 설치 {suspendedAttention.count}개</span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}

      <section className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2.5">
          <h2 className="text-sm font-medium text-foreground">최근 감사 로그</h2>
        </div>
        {payload.recentAudit.length ? (
          <ul className="divide-y divide-border">
            {payload.recentAudit.slice(0, 5).map((item) => (
              <li
                key={item.id}
                data-overview-audit-row
                className="flex min-h-11 items-center gap-3 px-3 py-2 text-xs"
              >
                <span className="font-medium text-foreground">{item.actor.login}</span>
                <span className="font-mono text-primary">{item.action}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.target.label}
                </span>
                <time dateTime={item.createdAt} className="shrink-0 text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            최근 감사 로그가 없습니다
          </p>
        )}
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <section className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-foreground">{value}</p>
    </section>
  );
}
