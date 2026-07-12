import type { AdminWorkspaceInstallationState } from "@folio/types";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminWorkspacesClient } from "@/components/admin/admin-workspaces-client";
import { Button } from "@/components/ui/button";
import { fetchAdminWorkspaces } from "@/lib/admin-api";
import { getAdminServerAccess, readAdminServerData } from "../admin-server-access";

const states: { value: "" | AdminWorkspaceInstallationState; label: string }[] = [
  { value: "", label: "모든 설치 상태" },
  { value: "none", label: "설치 없음" },
  { value: "active", label: "활성" },
  { value: "suspended", label: "정지됨" },
  { value: "mixed", label: "혼합" },
];

export default async function AdminWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; installationState?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = value(params.q)?.trim() || undefined;
  const installationState = state(value(params.installationState));
  const access = await getAdminServerAccess();
  const initialPage = await readAdminServerData(access, (cookie) =>
    fetchAdminWorkspaces({ q, installationState, limit: 25, cookie }),
  );
  return (
    <section className="mx-auto max-w-5xl">
      <AdminPageHeader
        title="Workspaces"
        description="워크스페이스 메타데이터와 GitHub App 설치 상태를 읽기 전용으로 확인합니다."
      />
      <form method="GET" className="mb-3 flex flex-wrap gap-2 rounded-lg border bg-card p-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="GitHub 계정 로그인 검색"
          className="h-8 min-w-48 flex-1 rounded-md border border-input bg-background px-2.5 text-xs"
        />
        <select
          name="installationState"
          defaultValue={installationState ?? ""}
          className="h-8 rounded-md border border-input bg-background px-2.5 text-xs"
        >
          {states.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          적용
        </Button>
      </form>
      <AdminWorkspacesClient initialPage={initialPage} filters={{ q, installationState }} />
    </section>
  );
}

function value(input: string | string[] | undefined) {
  return Array.isArray(input) ? input[0] : input;
}
function state(input: string | undefined): AdminWorkspaceInstallationState | undefined {
  return input === "none" || input === "active" || input === "suspended" || input === "mixed"
    ? input
    : undefined;
}
