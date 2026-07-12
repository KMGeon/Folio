import { FolderGit2 } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Shown when the desk has zero Settings-enabled repositories.
 * (Project list is filtered to folioEnabled only — empty ≠ "all installs empty".)
 */
export function DashboardNoEnabledRepos() {
  return (
    <section
      aria-label="No enabled repositories"
      className="rounded-xl border border-border bg-card/60 p-6 sm:p-8"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/70 text-primary">
          <FolderGit2 className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1.5">
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              Projects
            </p>
            <h2 className="text-lg font-medium tracking-tight text-foreground">
              활성화된 레포가 없습니다
            </h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
              이 데스크에는 Settings에서 Folio를 켠 레포만 표시됩니다. 리뷰할 프로젝트를 켠 뒤 다시
              돌아와 주세요.
            </p>
          </div>
          <ol className="max-w-lg list-decimal space-y-1.5 pl-4 text-sm text-muted-foreground">
            <li>
              <span className="text-foreground/90">Settings → Repositories</span> 로 이동
            </li>
            <li>리뷰에 쓸 레포 토글을 켭니다 (예: KMGeon/Folio)</li>
            <li>대시보드로 돌아오면 사이드바에 해당 프로젝트만 보입니다</li>
          </ol>
          <div className="pt-1">
            <Button asChild size="sm">
              <Link href="/settings/repositories">Repository settings 열기</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
