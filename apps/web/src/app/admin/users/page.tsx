import type { AdminUserStatusFilter } from "@folio/types";

import {
  AdminAnalyticsPanel,
  AdminAnalyticsRange,
} from "@/components/admin/analytics/admin-analytics-panel";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { Button } from "@/components/ui/button";
import { fetchAdminAnalytics, fetchAdminUsers } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

const STATUS_FILTERS: { value: AdminUserStatusFilter; label: string }[] = [
  { value: "all", label: "전체 상태" },
  { value: "pending", label: "승인 대기" },
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지됨" },
];

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    range?: string | string[];
  }>;
}) {
  const raw = await searchParams;
  const q = singleValue(raw.q)?.trim() || undefined;
  const status = statusFilter(singleValue(raw.status));
  const range = singleValue(raw.range) === "30d" ? "30d" : "7d";
  const access = await getAdminServerAccess();
  const [initialPage, analytics] = await Promise.all([
    readAdminServerData(access, (cookie) => fetchAdminUsers({ q, status, limit: 25, cookie })),
    readAdminServerData(access, (cookie) => fetchAdminAnalytics({ range, cookie })),
  ]);

  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader
        title="Users"
        description="전역 사용자 상태와 시스템 관리자 권한을 관리합니다."
        actions={
          <AdminAnalyticsRange range={range} pathname="/admin/users" query={{ q, status }} />
        }
      />

      <div className="mb-3">
        <AdminAnalyticsPanel analytics={analytics} section="users" />
      </div>

      <form
        method="GET"
        className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2"
      >
        <label className="min-w-48 flex-1">
          <span className="sr-only">사용자 검색</span>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="GitHub 로그인 또는 이메일 검색"
            className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <label>
          <span className="sr-only">상태 필터</span>
          <select
            name="status"
            defaultValue={status}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm">
          적용
        </Button>
      </form>

      <AdminUsersClient initialPage={initialPage} q={q} status={status} />
    </section>
  );
}

function singleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function statusFilter(value: string | undefined): AdminUserStatusFilter {
  return value === "pending" || value === "active" || value === "suspended" ? value : "all";
}
