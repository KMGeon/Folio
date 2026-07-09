import { cn } from "@/lib/utils";

export function ReviewLoadingSkeleton() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <SkeletonBlock className="size-7 rounded-md" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-9 w-56 rounded-md" />
          <SkeletonBlock className="size-8 rounded-full" />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <ReviewTopBarSkeleton />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border bg-card/60 px-3 py-2 text-muted-foreground text-xs">
            <SkeletonBlock className="size-2 rounded-full bg-primary/65" />
            <span>AI 리뷰 생성 중</span>
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
            <section>
              <ReviewPrologueSkeleton />
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <SkeletonBlock className="h-3 w-12" />
                <div className="flex rounded-md bg-muted/60 p-0.5">
                  <SkeletonBlock className="h-7 w-20 rounded" />
                  <SkeletonBlock className="h-7 w-16 rounded" />
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <ReviewChapterCardsSkeleton />
                <ReviewActivitySkeleton />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function ReviewTopBarSkeleton() {
  return (
    <div className="shrink-0 border-b bg-card/40 px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-5 w-full max-w-xl" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-7 w-24 rounded-md" />
          <SkeletonBlock className="h-7 w-24 rounded-md" />
          <SkeletonBlock className="h-7 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function ReviewPrologueSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <SkeletonBlock className="h-3 w-24" />
          <SkeletonBlock className="h-5 w-64 max-w-full" />
        </div>
        <SkeletonBlock className="h-6 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-11/12" />
        <SkeletonBlock className="h-3 w-4/5" />
      </div>
      <div className="mt-5 space-y-3 border-t pt-4">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-16 w-full rounded-md" />
        <SkeletonBlock className="h-16 w-full rounded-md" />
      </div>
    </div>
  );
}

function ReviewChapterCardsSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-lg border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <SkeletonBlock className="h-3 w-20" />
              <SkeletonBlock className="h-5 w-4/5" />
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-2/3" />
            </div>
            <SkeletonBlock className="size-8 rounded-md" />
          </div>
          <div className="mt-4 flex gap-2">
            <SkeletonBlock className="h-5 w-20 rounded-full" />
            <SkeletonBlock className="h-5 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ReviewActivitySkeleton() {
  return (
    <div className="hidden rounded-lg border bg-card p-3 xl:block">
      <div className="mb-4 flex items-center justify-between">
        <SkeletonBlock className="h-3 w-20" />
        <SkeletonBlock className="h-3 w-10" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <SkeletonBlock className="mt-1 size-2 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-3 w-4/5" />
              <SkeletonBlock className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}
