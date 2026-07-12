import { ArrowRight, GitPullRequest } from "lucide-react";
import Link from "next/link";

import { ReadingSpine, SizePill, sizeMeta } from "@/components/dashboard/dashboard-card-meta";
import {
  dashboardEmptyDescription,
  dashboardEmptyTitle,
  dashboardNextPull,
  dashboardProjectName,
  type DashboardProjectData,
  type DashboardQueueFocus,
} from "@/components/dashboard/dashboard-project-desk-model";
import { DashboardColumnSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { RiskPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type { DashboardPull } from "@/lib/dashboard-api";

export function DashboardNextUp({
  project,
  focus,
  onRetryReview,
}: {
  project: DashboardProjectData;
  focus: DashboardQueueFocus;
  onRetryReview: (pull: DashboardPull) => void;
}) {
  const name = dashboardProjectName(project.repo.fullName);
  const pull = dashboardNextPull(project, focus);

  if (project.isLoading) {
    return (
      <div className="grid gap-3">
        <DashboardColumnSkeleton />
      </div>
    );
  }
  if (project.error) {
    return (
      <div className="rounded-xl border border-border bg-card/50 p-5 text-sm text-muted-foreground">
        <strong className="block font-medium text-foreground">{name} could not be loaded</strong>
        <span>{project.error}</span>
      </div>
    );
  }
  if (focus === "completed" && project.pages.completed.count > 0) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
        <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">
          Complete focus
        </p>
        <h3 className="mt-3 text-base font-medium text-foreground">Complete in {name}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {name} 범위의 완료된 Folio 리뷰 {project.pages.completed.count}건을 확인하세요.
        </p>
      </div>
    );
  }
  if (!pull) {
    return (
      <DashboardProjectEmpty
        scopeName={name}
        focus={focus}
        repositoryFullName={project.repo.fullName}
      />
    );
  }

  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const failed = pull.analysisStatus === "failed";
  return (
    <article className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5">
      <p className="flex items-center gap-2 font-mono text-[0.65rem] uppercase tracking-[0.16em] text-primary">
        <GitPullRequest className="size-3.5" />
        Next up in {name}
      </p>
      <Link href={`/${pull.org}/${pull.repo}/pull/${pull.number}`} className="group mt-3 block">
        <h3 className="text-base font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
          {pull.title}
        </h3>
        <p className="mt-1.5 font-mono text-[0.7rem] text-muted-foreground">
          {pull.repo}#{pull.number} · {pull.updatedAt} · {pull.author}
        </p>
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <SizePill meta={size} />
        <RiskPill risk={pull.risk} />
        <span className="font-mono text-xs text-primary">+{pull.additions}</span>
        <span className="font-mono text-xs text-destructive">-{pull.deletions}</span>
        <ReadingSpine total={pull.chapterCount} viewed={pull.viewedChapters} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/${pull.org}/${pull.repo}/pull/${pull.number}`}>
            {pull.viewedChapters > 0 ? "Continue" : "Start review"}
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
        {failed ? (
          <Button type="button" variant="outline" size="sm" onClick={() => onRetryReview(pull)}>
            Retry analysis
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Empty queue for one enabled project (or All with projects still loading none). */
export function DashboardProjectEmpty({
  scopeName,
  focus,
  repositoryFullName,
}: {
  scopeName: string;
  focus: DashboardQueueFocus;
  repositoryFullName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-5 sm:p-6">
      <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
        Project queue
      </p>
      <h3 className="mt-3 text-base font-medium text-foreground">
        {dashboardEmptyTitle(scopeName)}
      </h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {dashboardEmptyDescription(scopeName, focus)}
      </p>
      {repositoryFullName ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={`https://github.com/${repositoryFullName}/pulls`}>GitHub PRs</a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/settings/repositories">Repository settings</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
