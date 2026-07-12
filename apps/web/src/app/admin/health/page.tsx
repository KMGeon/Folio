import type { AdminHealthPayload } from "@folio/types";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminHealth } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

export default async function AdminHealthPage() {
  const access = await getAdminServerAccess();
  const health = await readAdminServerData(access, (cookie) => fetchAdminHealth({ cookie }));

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <AdminPageHeader
        title="Health"
        description="Worker heartbeat와 review_pull 성공 증거, 큐 상태입니다. Codex live probe는 하지 않습니다."
      />

      <WorkerCard worker={health.worker} />
      <CodexCard codexPath={health.codexPath} />
      <QueueCard queue={health.queue} />

      <p className="text-xs text-muted-foreground">
        확인 시각 {new Date(health.checkedAt).toLocaleString()} · public <code>/health</code> 는 API
        프로세스 전용입니다.
      </p>
    </section>
  );
}

function WorkerCard({ worker }: { worker: AdminHealthPayload["worker"] }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-medium text-foreground">Worker</h2>
        <StatusBadge status={worker.status} />
      </div>
      <div className="px-3 py-3 text-xs text-muted-foreground">
        stale 기준 {worker.staleAfterSeconds}s · heartbeat가 없으면 unknown
      </div>
      {worker.workers.length === 0 ? (
        <p className="px-3 pb-4 text-xs text-muted-foreground">아직 heartbeat가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-border border-t">
          {worker.workers.map((item) => (
            <li key={item.workerId} className="flex min-h-11 items-center gap-3 px-3 py-2 text-xs">
              <span className="font-mono text-foreground">{item.workerId}</span>
              <span className="text-muted-foreground">{item.status}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                age {item.ageSeconds}s
              </span>
              <time dateTime={item.lastSeenAt} className="shrink-0 text-muted-foreground">
                {new Date(item.lastSeenAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CodexCard({ codexPath }: { codexPath: AdminHealthPayload["codexPath"] }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <h2 className="text-sm font-medium text-foreground">Codex path</h2>
        <StatusBadge status={codexPath.status} />
      </div>
      <dl className="grid gap-2 px-3 py-3 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Last review_pull success</dt>
          <dd className="mt-0.5 text-foreground">
            {codexPath.lastReviewPullSucceededAt
              ? new Date(codexPath.lastReviewPullSucceededAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Succeeded 24h</dt>
          <dd className="mt-0.5 font-mono text-foreground">
            {codexPath.reviewPullSucceededLast24h}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Failed/dead 24h</dt>
          <dd className="mt-0.5 font-mono text-foreground">{codexPath.reviewPullFailedLast24h}</dd>
        </div>
      </dl>
      <p className="border-t px-3 py-2.5 text-xs text-muted-foreground">{codexPath.note}</p>
    </section>
  );
}

function QueueCard({ queue }: { queue: AdminHealthPayload["queue"] }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2.5">
        <h2 className="text-sm font-medium text-foreground">Queue</h2>
      </div>
      <div className="flex flex-wrap gap-4 px-3 py-3 text-xs">
        <Link href="/admin/operations" className="text-primary hover:underline">
          pending {queue.pending}
        </Link>
        <Link href="/admin/operations?distressed=true" className="text-primary hover:underline">
          distressed {queue.distressedJobs}
        </Link>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ok" || status === "recent_success"
      ? "text-primary"
      : status === "stale" || status === "no_success"
        ? "text-destructive"
        : "text-muted-foreground";
  return <span className={`font-mono text-xs ${tone}`}>{status}</span>;
}
