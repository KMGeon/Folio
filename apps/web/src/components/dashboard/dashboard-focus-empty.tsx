import { GitPullRequestArrow } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Shown when every open bucket is empty — keeps an empty desk from reading as a
 * broken board of three dashed columns.
 */
export function DashboardFocusEmpty({
  onSearchClick,
  onShowComplete,
}: {
  onSearchClick: () => void;
  onShowComplete?: () => void;
}) {
  return (
    <section className="flex min-h-[240px] flex-col justify-between rounded-2xl border border-border bg-gradient-to-br from-primary/12 via-card to-card p-6">
      <div className="space-y-3">
        <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-background/50 text-primary">
          <GitPullRequestArrow className="size-4" />
        </div>
        <div className="space-y-1.5">
          <h2 className="font-sans text-base font-medium tracking-tight text-foreground">
            리뷰 큐가 비어 있습니다
          </h2>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            새 리뷰 요청이 오면 여기에 가장 먼저 표시됩니다. 그동안 최근 완료된 작업을 훑거나 PR을
            검색해 보세요.
          </p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onSearchClick}>
          PR 검색
        </Button>
        {onShowComplete ? (
          <Button type="button" size="sm" variant="outline" onClick={onShowComplete}>
            Complete 보기
          </Button>
        ) : null}
      </div>
    </section>
  );
}
