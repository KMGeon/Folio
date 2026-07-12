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
      <ul
        aria-label="워크스페이스 목록"
        className="divide-y divide-border rounded-lg border bg-card"
      >
        {items.map((workspace) => (
          <WorkspaceRow key={workspace.id} workspace={workspace} />
        ))}
      </ul>
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
    <li className="flex min-h-14 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/workspaces/${workspace.id}`}
          className="text-sm font-medium text-foreground hover:text-primary"
        >
          {workspace.accountLogin}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">
          구성원 {workspace.memberCount} · 저장소 {workspace.enabledRepositoryCount}/
          {workspace.repositoryCount} · 설치 {workspace.installationState}
        </p>
      </div>
      <time
        className="shrink-0 text-xs text-muted-foreground"
        dateTime={workspace.recentActivityAt ?? workspace.createdAt}
      >
        {workspace.recentActivityAt
          ? new Date(workspace.recentActivityAt).toLocaleString()
          : "활동 없음"}
      </time>
    </li>
  );
}

function appendUnique(current: AdminWorkspaceItem[], incoming: AdminWorkspaceItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
