import type { AuditAction } from "@folio/types";
import { cookies } from "next/headers";

import { AdminAuditClient, type AdminAuditQuery } from "@/components/admin/admin-audit-client";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminAudit } from "@/lib/admin-api";

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
  const filters: AdminAuditQuery = {
    q: value(raw.q),
    action: actionValue(raw.action),
    workspaceId: value(raw.workspaceId),
    actorUserId: value(raw.actorUserId),
    targetId: value(raw.targetId),
    from: dateOnlyValue(raw.from),
    to: dateOnlyValue(raw.to),
  };
  const cookie = (await cookies())
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  // Date inputs stay date-only in the form, while the API contract requires offset-aware instants.
  const initialPage = await fetchAdminAudit({
    ...filters,
    from: dateBoundary(filters.from, "start"),
    to: dateBoundary(filters.to, "end"),
    limit: 25,
    cookie,
  });

  return (
    <section className="mx-auto max-w-6xl">
      <AdminPageHeader title="Audit log" description="관리 작업과 권한 변경 이력을 확인합니다." />
      <AdminAuditClient initialPage={initialPage} filters={filters} />
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
