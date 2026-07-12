import type { AuditAction } from "@folio/types";

import {
  AdminAnalyticsPanel,
  AdminAnalyticsRange,
} from "@/components/admin/analytics/admin-analytics-panel";
import {
  AdminAuditClient,
  type AdminAuditFormFilters,
  type AdminAuditRequestFilters,
} from "@/components/admin/admin-audit-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminAnalytics, fetchAdminAudit } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

const AUDIT_ACTIONS = new Set<AuditAction>([
  "user_approve",
  "user_suspend",
  "member_suspend",
  "member_restore",
  "role_change",
  "owner_transfer",
  "system_admin_transfer",
  "workspace_claim",
  "repo_activation_change",
]);

type AuditSearchParams = Record<string, string | string[] | undefined>;

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const raw = await searchParams;
  const formFilters: AdminAuditFormFilters = {
    q: value(raw.q),
    action: actionValue(raw.action),
    workspaceId: value(raw.workspaceId),
    actorUserId: value(raw.actorUserId),
    targetId: value(raw.targetId),
    from: dateOnlyValue(raw.from),
    to: dateOnlyValue(raw.to),
  };
  // Keep one validated request object shared by the initial fetch and every cursor request.
  const requestFilters: AdminAuditRequestFilters = {
    ...formFilters,
    from: dateBoundary(formFilters.from, "start"),
    to: dateBoundary(formFilters.to, "end"),
  };
  const range = value(raw.range) === "30d" ? "30d" : "7d";
  const access = await getAdminServerAccess();
  const [initialPage, analytics] = await Promise.all([
    readAdminServerData(access, (cookie) =>
      fetchAdminAudit({
        ...requestFilters,
        limit: 25,
        cookie,
      }),
    ),
    readAdminServerData(access, (cookie) => fetchAdminAnalytics({ range, cookie })),
  ]);

  return (
    <section className="mx-auto max-w-6xl">
      <AdminPageHeader
        title="Audit log"
        description="관리 작업과 권한 변경 이력을 추세와 상세 기록으로 확인합니다."
        actions={
          <AdminAnalyticsRange range={range} pathname="/admin/audit" query={{ ...formFilters }} />
        }
      />
      <div className="mb-3">
        <AdminAnalyticsPanel analytics={analytics} section="audit" />
      </div>
      <AdminAuditClient
        initialPage={initialPage}
        formFilters={formFilters}
        requestFilters={requestFilters}
      />
    </section>
  );
}

function value(input: string | string[] | undefined): string | undefined {
  const first = Array.isArray(input) ? input[0] : input;
  return first?.trim() || undefined;
}

function actionValue(input: string | string[] | undefined): AuditAction | undefined {
  const action = value(input);
  return action && AUDIT_ACTIONS.has(action as AuditAction) ? (action as AuditAction) : undefined;
}

function dateOnlyValue(input: string | string[] | undefined): string | undefined {
  const date = value(input);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return undefined;
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date
    ? date
    : undefined;
}

function dateBoundary(date: string | undefined, boundary: "start" | "end"): string | undefined {
  if (!date) {
    return undefined;
  }
  return `${date}${boundary === "start" ? "T00:00:00.000Z" : "T23:59:59.999Z"}`;
}
