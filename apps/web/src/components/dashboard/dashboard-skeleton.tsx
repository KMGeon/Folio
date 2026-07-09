import { cn } from "@/lib/utils";

export function DashboardSkeletonCard({ dashed = false }: { dashed?: boolean }) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-4", dashed && "border-dashed bg-background/35")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-3 w-28 rounded bg-muted" />
          <div className="h-4 w-4/5 rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
        </div>
        <div className="h-3 w-8 rounded bg-muted" />
      </div>
      <div className="mt-4 h-5 w-16 rounded-full bg-muted" />
      <div className="mt-4 flex gap-3">
        <div className="h-3 w-14 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
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
