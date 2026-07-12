import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { fetchAdminWorkspace } from "@/lib/admin-api";
import { ApiError } from "@/lib/api-client";
import { getAdminServerAccess, readAdminServerData } from "../../admin-server-access";

export default async function AdminWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const access = await getAdminServerAccess();
  let workspace;
  try {
    workspace = await readAdminServerData(access, (cookie) =>
      fetchAdminWorkspace(workspaceId, { cookie }),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader
        title={workspace.accountLogin}
        description="읽기 전용 워크스페이스 메타데이터입니다."
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Panel
          title="구성원"
          rows={workspace.members.map((item) => `${item.login} · ${item.role} · ${item.status}`)}
        />
        <Panel
          title="저장소"
          rows={workspace.repositories.map(
            (item) => `${item.fullName} · ${item.folioEnabled ? "Folio 활성" : "비활성"}`,
          )}
        />
        <Panel
          title="설치"
          rows={workspace.installations.map(
            (item) => `${item.accountLogin} · ${item.suspendedAt ? "정지됨" : "활성"}`,
          )}
        />
        <Panel
          title="최근 감사 로그"
          rows={workspace.recentAudit.map(
            (item) => `${item.actor.login} · ${item.action} · ${item.target.label}`,
          )}
        />
      </div>
    </section>
  );
}

function Panel({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section className="rounded-lg border bg-card">
      <h2 className="border-b px-3 py-2.5 text-sm font-medium text-foreground">{title}</h2>
      {rows.length ? (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row} className="px-3 py-2 text-xs text-muted-foreground">
              {row}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">항목이 없습니다.</p>
      )}
    </section>
  );
}
