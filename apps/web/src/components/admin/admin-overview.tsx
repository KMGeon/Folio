import type { AdminOverviewPayload } from "@folio/types";
import { ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";

export function AdminOverview({ payload }: { payload: AdminOverviewPayload }) {
  const pendingAttention = payload.attention.find((item) => item.kind === "pending_users");
  const suspendedAttention = payload.attention.find(
    (item) => item.kind === "suspended_installations",
  );
  const distressedAttention = payload.attention.find((item) => item.kind === "distressed_jobs");

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="승인 대기 사용자" value={payload.metrics.pendingUsers} />
        <Metric label="워크스페이스" value={payload.metrics.workspaces} />
        <Metric label="활성화된 저장소" value={payload.metrics.enabledRepositories} />
        <Metric label="문제 작업" value={payload.metrics.distressedJobs} />
      </div>

      {pendingAttention ? (
        <AttentionLink
          href="/admin/users?status=pending"
          tone="primary"
          label={`승인 대기 사용자 ${pendingAttention.count}명`}
        />
      ) : null}

      {suspendedAttention ? (
        <AttentionLink
          href="/admin/workspaces?installationState=suspended"
          tone="destructive"
          label={`정지된 GitHub 설치 ${suspendedAttention.count}개`}
        />
      ) : null}

      {distressedAttention ? (
        <AttentionLink
          href="/admin/operations?distressed=true"
          tone="destructive"
          label={`문제 작업 ${distressedAttention.count}개`}
        />
      ) : null}

      <section className="rounded-lg border bg-card">
        <div className="border-b px-3 py-2.5">
          <h2 className="text-sm font-medium text-foreground">큐 스냅샷</h2>
        </div>
        <dl className="grid gap-2 px-3 py-3 text-xs sm:grid-cols-5">
          <Snapshot label="pending" value={payload.queueSnapshot.pending} />
          <Snapshot label="running" value={payload.queueSnapshot.running} />
          <Snapshot label="retrying" value={payload.queueSnapshot.retrying} />
          <Snapshot label="succeeded 24h" value={payload.queueSnapshot.succeededLast24h} />
          <Snapshot label="dead 24h" value={payload.queueSnapshot.deadLast24h} />
        </dl>
      </section>

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

function Snapshot({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}

function AttentionLink({
  href,
  label,
  tone,
}: {
  href: string;
  label: string;
  tone: "primary" | "destructive";
}) {
  const classes =
    tone === "primary"
      ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
      : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15";
  return (
    <Link
      href={href}
      className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-xs transition-colors ${classes}`}
    >
      <Clock3 className="size-3.5" aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <ArrowRight className="size-3.5" aria-hidden="true" />
    </Link>
  );
}
