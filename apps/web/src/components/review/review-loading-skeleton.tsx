import { cn } from "@/lib/utils";

export function ReviewLoadingSkeleton() {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SkeletonBlock className="size-8 rounded-md" />
          <SkeletonBlock className="hidden h-4 w-14 sm:block" />
          <span aria-hidden className="hidden text-border sm:inline">
            /
          </span>
          <SkeletonBlock className="h-3.5 w-28" />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SkeletonBlock className="h-9 w-56 rounded-md" />
          <SkeletonBlock className="size-8 rounded-full" />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <ReviewTopBarSkeleton />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6">
          {/* Live "generating" cue: mono eyebrow + a pulsing vivid primary dot. */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-md border bg-card/60 px-3 py-1.5">
            <SkeletonBlock className="size-2 rounded-full bg-primary/70" />
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
              AI 리뷰 생성 중
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
            <section>
              <div className="mb-3 flex items-center gap-2">
                <SkeletonBlock className="h-2.5 w-16" />
                <div className="flex gap-0.5 rounded-md bg-muted/60 p-0.5">
                  <SkeletonBlock className="h-6 w-24 rounded" />
                  <SkeletonBlock className="h-6 w-24 rounded" />
                  <SkeletonBlock className="h-6 w-24 rounded" />
                </div>
                <SkeletonBlock className="ml-auto size-4 rounded" />
              </div>
              <ReviewPrologueSkeleton />
            </section>
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <SkeletonBlock className="h-2.5 w-10" />
                <div className="flex gap-0.5 rounded-md bg-muted/60 p-0.5">
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
    <div className="shrink-0 px-4 pt-3 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-6 w-20 rounded-md" />
            <SkeletonBlock className="h-2.5 w-24" />
          </div>
          {/* Serif-height masthead title bar. */}
          <SkeletonBlock className="h-8 w-full max-w-md" />
        </div>
        <SkeletonBlock className="size-8 shrink-0 rounded-md" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SkeletonBlock className="h-4 w-44 rounded" />
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-5 w-24 rounded-full" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-4">
          <SkeletonBlock className="h-4 w-24" />
          <SkeletonBlock className="h-4 w-28" />
        </div>
        <SkeletonBlock className="h-3 w-32" />
      </div>
    </div>
  );
}

function ReviewPrologueSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-center gap-2">
        <SkeletonBlock className="size-6 rounded-full" />
        <SkeletonBlock className="h-3 w-24" />
      </div>
      <div className="space-y-2.5">
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-11/12" />
        <SkeletonBlock className="h-3 w-4/5" />
        <SkeletonBlock className="h-3 w-5/6" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
    </div>
  );
}

function ReviewChapterCardsSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b p-3 last:border-b-0">
          <SkeletonBlock className="size-6 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            {/* Serif-height chapter title bar. */}
            <SkeletonBlock className="h-5 w-3/5" />
            <div className="flex flex-wrap items-center gap-2.5">
              <SkeletonBlock className="h-5 w-20 rounded-full" />
              <SkeletonBlock className="h-4 w-10" />
              <SkeletonBlock className="h-4 w-10" />
              <SkeletonBlock className="h-4 w-12" />
            </div>
          </div>
          <SkeletonBlock className="size-5 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}

function ReviewActivitySkeleton() {
  return (
    <div className="hidden rounded-lg border bg-card p-3 xl:block">
      <div className="mb-4 flex items-center justify-between">
        <SkeletonBlock className="h-2.5 w-20" />
        <SkeletonBlock className="h-2.5 w-8" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="flex gap-3">
            <SkeletonBlock className="mt-1 size-3 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-3 w-4/5" />
              <SkeletonBlock className="h-2.5 w-1/2" />
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
