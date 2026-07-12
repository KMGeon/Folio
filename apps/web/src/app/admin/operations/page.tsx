import type { AdminJobKind, AdminJobStatus } from "@folio/types";
import { AdminJobsClient } from "@/components/admin/admin-jobs-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { fetchAdminJobs } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

const STATUSES: { value: "" | AdminJobStatus; label: string }[] = [
  { value: "", label: "모든 상태" },
  { value: "pending", label: "pending" },
  { value: "claimed", label: "claimed" },
  { value: "running", label: "running" },
  { value: "succeeded", label: "succeeded" },
  { value: "failed", label: "failed" },
  { value: "dead", label: "dead" },
];

const KINDS: { value: "" | AdminJobKind; label: string }[] = [
  { value: "", label: "모든 종류" },
  { value: "review_pull", label: "review_pull" },
  { value: "decompose", label: "decompose" },
  { value: "re_chapter", label: "re_chapter" },
  { value: "sync_comments", label: "sync_comments" },
  { value: "pr_index_backfill", label: "pr_index_backfill" },
];

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    kind?: string | string[];
    distressed?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const q = single(params.q)?.trim() || undefined;
  const status = asStatus(single(params.status));
  const kind = asKind(single(params.kind));
  const distressed = single(params.distressed) === "true" ? true : undefined;
  const access = await getAdminServerAccess();
  const initialPage = await readAdminServerData(access, (cookie) =>
    fetchAdminJobs({ q, status, kind, distressed, limit: 25, cookie }),
  );

  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader
        title="Operations"
        description="큐 작업 상태를 읽기 전용으로 관찰합니다. 재시도·취소·워커 제어는 제공하지 않습니다."
      />
      <form method="GET" className="mb-3 flex flex-wrap gap-2 rounded-lg border bg-card p-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="작업 UUID 검색"
          className="h-8 min-w-48 flex-1 rounded-md border border-input bg-background px-2.5 text-xs"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
        >
          {STATUSES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          name="kind"
          defaultValue={kind ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
        >
          {KINDS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <label className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground">
          <input type="checkbox" name="distressed" value="true" defaultChecked={distressed} />
          distressed only
        </label>
        <Button type="submit" size="sm">
          적용
        </Button>
      </form>
      <AdminJobsClient initialPage={initialPage} filters={{ q, status, kind, distressed }} />
    </section>
  );
}

function single(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}

function asStatus(input: string | undefined): AdminJobStatus | undefined {
  return STATUSES.some((item) => item.value === input) && input
    ? (input as AdminJobStatus)
    : undefined;
}

function asKind(input: string | undefined): AdminJobKind | undefined {
  return KINDS.some((item) => item.value === input) && input ? (input as AdminJobKind) : undefined;
}
