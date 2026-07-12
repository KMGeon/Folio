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
    from: value(raw.from),
    to: value(raw.to),
  };
  const cookie = (await cookies())
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  const initialPage = await fetchAdminAudit({ ...filters, limit: 25, cookie });

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
