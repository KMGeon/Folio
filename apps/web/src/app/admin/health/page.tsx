import type { AdminHealthPayload } from "@folio/types";
import Link from "next/link";
import {
  AdminAnalyticsPanel,
  AdminAnalyticsRange,
} from "@/components/admin/analytics/admin-analytics-panel";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminAnalytics, fetchAdminHealth } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[] }>;
}) {
  const params = await searchParams;
  const range = value(params.range);
  const access = await getAdminServerAccess();
  const [health, analytics] = await Promise.all([
    readAdminServerData(access, (cookie) => fetchAdminHealth({ cookie })),
    readAdminServerData(access, (cookie) => fetchAdminAnalytics({ range, cookie })),
  ]);

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <AdminPageHeader
        title="Health"
        description="Worker heartbeat와 review_pull 성공 증거, 큐 상태입니다. Codex live probe는 하지 않습니다."
        actions={<AdminAnalyticsRange range={range} pathname="/admin/health" />}
      />

      <AdminAnalyticsPanel analytics={analytics} section="health" />
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

function value(input: string | string[] | undefined) {
  return (Array.isArray(input) ? input[0] : input) === "30d" ? "30d" : "7d";
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
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="border-b bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Worker</th>
                <th className="px-3 py-2 font-medium">상태</th>
                <th className="px-3 py-2 text-right font-medium">Heartbeat age</th>
                <th className="px-3 py-2 text-right font-medium">마지막 확인</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {worker.workers.map((item) => (
                <tr key={item.workerId} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-foreground">{item.workerId}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.status}</td>
                  <td className="px-3 py-2 text-right font-mono text-foreground">
                    {item.ageSeconds}s
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
                    <time dateTime={item.lastSeenAt}>
                      {new Date(item.lastSeenAt).toLocaleString()}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
