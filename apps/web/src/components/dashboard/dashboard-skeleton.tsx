import { cn } from "@/lib/utils";

export function DashboardSkeletonCard({ dashed = false }: { dashed?: boolean }) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-4", dashed && "border-dashed bg-background/35")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Mono eyebrow (repo · #id), then serif-height title bars. */}
          <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
          <div className="mt-2.5 space-y-2">
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-2.5 w-8 shrink-0 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-3 h-5 w-16 animate-pulse rounded-full bg-muted" />
      <div className="mt-4 flex items-center gap-3">
        <div className="h-3 w-14 animate-pulse rounded bg-muted" />
        <div className="h-3 w-10 animate-pulse rounded bg-muted" />
        <div className="h-3 w-10 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

export function DashboardColumnSkeleton({ dashed = false }: { dashed?: boolean }) {
  return (
    <>
      <DashboardSkeletonCard dashed={dashed} />
      <DashboardSkeletonCard dashed={dashed} />
      <DashboardSkeletonCard dashed={dashed} />
    </>
  );
}
