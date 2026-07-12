"use client";

import type { AdminJobItem, AdminJobPage } from "@folio/types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { type AdminJobFilters, fetchAdminJobs } from "@/lib/admin-api";

export function AdminJobsClient({
  initialPage,
  filters,
}: {
  initialPage: AdminJobPage;
  filters: Omit<AdminJobFilters, "cursor" | "limit">;
}) {
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialPage.items);
    setNextCursor(initialPage.nextCursor);
    setError(null);
  }, [initialPage, filters.q, filters.status, filters.kind, filters.distressed]);

  const loadMore = async () => {
    if (!nextCursor || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminJobs({ ...filters, limit: 25, cursor: nextCursor });
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
        작업이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul aria-label="작업 목록" className="divide-y divide-border rounded-lg border bg-card">
        {items.map((job) => (
          <JobRow key={job.id} job={job} />
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

function JobRow({ job }: { job: AdminJobItem }) {
  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/operations/jobs/${job.id}`}
          className="font-mono text-sm font-medium text-foreground hover:text-primary"
        >
          {job.kind}
        </Link>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {job.status}
          {job.isDistressed ? " · distressed" : ""}
          {" · "}
          시도 {job.attempts}/{job.maxAttempts}
          {job.repository ? ` · ${job.repository.fullName}` : ""}
        </p>
      </div>
      <time className="shrink-0 text-xs text-muted-foreground" dateTime={job.updatedAt}>
        {new Date(job.updatedAt).toLocaleString()}
      </time>
    </li>
  );
}

function appendUnique(current: AdminJobItem[], incoming: AdminJobItem[]) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}
