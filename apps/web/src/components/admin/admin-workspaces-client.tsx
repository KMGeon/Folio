"use client";

import type { AdminWorkspaceItem, AdminWorkspacePage } from "@folio/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type AdminWorkspaceFilters, fetchAdminWorkspaces } from "@/lib/admin-api";

export function AdminWorkspacesClient({
  initialPage,
  filters,
}: {
  initialPage: AdminWorkspacePage;
  filters: Omit<AdminWorkspaceFilters, "cursor" | "limit">;
}) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialPage.items);
    setNextCursor(initialPage.nextCursor);
    setError(null);
  }, [initialPage, filters.q, filters.installationState]);

  const loadMore = async () => {
    if (!nextCursor || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminWorkspaces({ ...filters, limit: 25, cursor: nextCursor });
      setItems((current) => appendUnique(current, page.items));
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!items.length) {
    return (
      <p className="rounded-lg border bg-card px-3 py-8 text-center text-xs text-muted-foreground">
        워크스페이스가 없습니다.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table aria-label="워크스페이스 목록" className="w-full min-w-[48rem] text-left text-xs">
          <thead className="border-b bg-muted/30 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">워크스페이스</th>
              <th className="px-3 py-2 text-right font-medium">구성원</th>
              <th className="px-3 py-2 text-right font-medium">저장소</th>
              <th className="px-3 py-2 font-medium">설치 상태</th>
              <th className="px-3 py-2 text-right font-medium">최근 활동</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((workspace) => (
              <WorkspaceRow key={workspace.id} workspace={workspace} />
            ))}
          </tbody>
        </table>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {nextCursor ? (
        <Button type="button" variant="outline" size="sm" onClick={loadMore} disabled={loading}>
          {loading ? "불러오는 중…" : "더 보기"}
        </Button>
      ) : null}
    </div>
  );
}

function WorkspaceRow({ workspace }: { workspace: AdminWorkspaceItem }) {
  return (
    <tr className="transition-colors hover:bg-muted/30">
      <td className="min-w-0 px-3 py-2">
        <Link
          href={`/admin/workspaces/${workspace.id}`}
          className="text-sm font-medium text-foreground hover:text-primary"
        >
          {workspace.accountLogin}
        </Link>
      </td>
      <td className="px-3 py-2 text-right font-mono text-foreground">{workspace.memberCount}</td>
      <td className="px-3 py-2 text-right font-mono text-foreground">
        {workspace.enabledRepositoryCount}/{workspace.repositoryCount}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{workspace.installationState}</td>
      <td className="whitespace-nowrap px-3 py-2 text-right text-muted-foreground">
        {workspace.recentActivityAt ? (
          <time dateTime={workspace.recentActivityAt}>
            {new Date(workspace.recentActivityAt).toLocaleString()}
          </time>
        ) : (
          "활동 없음"
        )}
      </td>
    </tr>
  );
}

function appendUnique(current: AdminWorkspaceItem[], incoming: AdminWorkspaceItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
