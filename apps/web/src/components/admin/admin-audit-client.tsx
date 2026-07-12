"use client";

import type { AdminAuditItem, AdminAuditPage, AuditAction } from "@folio/types";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { type AdminAuditFilters, fetchAdminAudit } from "@/lib/admin-api";

const ACTIONS: { value: AuditAction | ""; label: string }[] = [
  { value: "", label: "전체 작업" },
  { value: "user_approve", label: "사용자 승인" },
  { value: "user_suspend", label: "사용자 정지" },
  { value: "member_suspend", label: "멤버 정지" },
  { value: "member_restore", label: "멤버 복원" },
  { value: "role_change", label: "역할 변경" },
  { value: "owner_transfer", label: "소유권 이전" },
  { value: "system_admin_transfer", label: "시스템 관리자 이전" },
  { value: "workspace_claim", label: "워크스페이스 연결" },
  { value: "repo_activation_change", label: "저장소 활성화 변경" },
];

export type AdminAuditFormFilters = Omit<AdminAuditFilters, "cursor" | "limit">;
export type AdminAuditRequestFilters = Omit<AdminAuditFilters, "cursor" | "limit">;

export function AdminAuditClient({
  initialPage,
  formFilters,
  requestFilters,
}: {
  initialPage: AdminAuditPage;
  formFilters: AdminAuditFormFilters;
  requestFilters: AdminAuditRequestFilters;
}) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    setItems(initialPage.items);
    setNextCursor(initialPage.nextCursor);
    setLoadingMore(false);
    setError(null);
  }, [formFilters, initialPage, requestFilters]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    const requestGeneration = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchAdminAudit({ ...requestFilters, limit: 25, cursor: nextCursor });
      if (requestGeneration !== generation.current) {
        return;
      }
      // Cursor pages can overlap as audit rows are inserted between requests.
      setItems((current) => appendUnique(current, page.items));
      setNextCursor(page.nextCursor);
    } catch (caught) {
      if (requestGeneration === generation.current) {
        setError(errorMessage(caught));
      }
    } finally {
      if (requestGeneration === generation.current) {
        setLoadingMore(false);
      }
    }
  };

  return (
    <div className="space-y-3">
      <AuditFilters filters={formFilters} />

      {items.length ? (
        <ul aria-label="감사 로그" className="divide-y divide-border rounded-lg border bg-card">
          {items.map((item) => (
            <AuditRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          감사 로그가 없습니다
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{error}</span>
          {nextCursor ? (
            <Button type="button" size="xxs" variant="outline" onClick={() => void loadMore()}>
              <RotateCcw aria-hidden="true" />
              다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      {nextCursor && !error ? (
        <div className="flex justify-center">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            <ChevronDown aria-hidden="true" />
            {loadingMore ? "불러오는 중" : "더 보기"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AuditFilters({ filters }: { filters: AdminAuditFormFilters }) {
  return (
    <form
      action="/admin/audit"
      method="GET"
      className="grid gap-2 rounded-lg border bg-card p-2 sm:grid-cols-2 lg:grid-cols-4"
    >
      <FilterInput
        name="q"
        label="감사 로그 검색"
        value={filters.q}
        placeholder="작업 또는 대상 검색"
      />
      <label>
        <span className="sr-only">작업 필터</span>
        <select name="action" defaultValue={filters.action ?? ""} className={controlClass}>
          {ACTIONS.map((action) => (
            <option key={action.value} value={action.value}>
              {action.label}
            </option>
          ))}
        </select>
      </label>
      <FilterInput name="workspaceId" label="워크스페이스 ID" value={filters.workspaceId} />
      <FilterInput name="actorUserId" label="행위자 사용자 ID" value={filters.actorUserId} />
      <FilterInput name="targetId" label="대상 ID" value={filters.targetId} />
      <FilterInput name="from" label="시작일" value={filters.from} type="date" />
      <FilterInput name="to" label="종료일" value={filters.to} type="date" />
      <Button type="submit" size="sm">
        적용
      </Button>
    </form>
  );
}

const controlClass =
  "h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function FilterInput({
  name,
  label,
  value,
  placeholder,
  type = "text",
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={value}
        placeholder={placeholder ?? label}
        className={controlClass}
      />
    </label>
  );
}

function AuditRow({ item }: { item: AdminAuditItem }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li data-audit-row className="px-3 py-2.5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          <span className="sr-only">세부 정보</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-medium text-foreground">{item.actor.login}</span>
            <span className="font-mono text-primary">{item.action}</span>
            <span className="truncate text-foreground">{item.target.label}</span>
            <span className="text-muted-foreground">{item.target.type}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{item.workspace?.accountLogin ?? "전역"}</span>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
          </div>
        </div>
      </div>
      {expanded ? <AuditSnapshots item={item} /> : null}
    </li>
  );
}

function AuditSnapshots({ item }: { item: AdminAuditItem }) {
  return (
    <div className="mt-2 grid gap-2 pl-9 md:grid-cols-2">
      <Snapshot label="Before" value={item.before} />
      <Snapshot label="After" value={item.after} />
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: AdminAuditItem["before"] }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">{label}</h3>
      <pre className="max-h-48 overflow-auto rounded-md border bg-background p-2 font-mono text-xs text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function appendUnique(current: AdminAuditItem[], incoming: AdminAuditItem[]): AdminAuditItem[] {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function errorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
  return `감사 로그를 불러오지 못했습니다. ${detail}`;
}
