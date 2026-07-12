import { GitMerge, X } from "lucide-react";
import Link from "next/link";

import { SizePill, sizeMeta } from "@/components/dashboard/dashboard-card-meta";
import {
  dashboardProjectCounts,
  dashboardProjectName,
  type DashboardProjectData,
  type DashboardQueueFocus,
} from "@/components/dashboard/dashboard-project-desk-model";
import { DashboardNextUp, DashboardProjectEmpty } from "@/components/dashboard/dashboard-next-up";
import type {
  DashboardCardProperty,
  DashboardCompletedPull,
  DashboardPull,
} from "@/lib/dashboard-api";

export function DashboardProjectView({
  projects,
  activeRepoId,
  focus,
  visibleProperties,
  onRetryReview,
}: {
  projects: DashboardProjectData[];
  activeRepoId: string | null;
  focus: DashboardQueueFocus;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
}) {
  if (projects.length === 0) {
    // projects[] is already Settings-enabled only — empty means none toggled on.
    return <DashboardProjectEmpty scopeName="All projects" focus={focus} noEnabledRepos />;
  }

  if (activeRepoId) {
    const project = projects.find((candidate) => candidate.repo.id === activeRepoId);
    if (!project) {
      return <DashboardProjectEmpty scopeName="All projects" focus={focus} />;
    }
    const name = dashboardProjectName(project.repo.fullName);
    return (
      <div aria-label={`${name} review desk`}>
        <ProjectDesk
          project={project}
          focus={focus}
          visibleProperties={visibleProperties}
          onRetryReview={onRetryReview}
          focused
        />
      </div>
    );
  }

  return (
    <div aria-label="All projects review sections" className="grid gap-4">
      {projects.map((project) => (
        <ProjectDesk
          key={project.repo.id}
          project={project}
          focus={focus}
          visibleProperties={visibleProperties}
          onRetryReview={onRetryReview}
        />
      ))}
    </div>
  );
}

function ProjectDesk({
  project,
  focus,
  visibleProperties,
  onRetryReview,
  focused = false,
}: {
  project: DashboardProjectData;
  focus: DashboardQueueFocus;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
  focused?: boolean;
}) {
  const name = dashboardProjectName(project.repo.fullName);
  const counts = dashboardProjectCounts(project);
  const completed = project.pages.completed.items as DashboardCompletedPull[];
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card/35">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium text-foreground">{name}</h2>
          <p className="truncate font-mono text-[0.65rem] text-muted-foreground">
            {project.repo.fullName} · Folio enabled
          </p>
        </div>
        <div className="flex gap-3 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
          <span className={counts.ready > 0 ? "text-primary" : undefined}>
            ready {counts.ready}
          </span>
          <span>yours {counts.yours}</span>
          <span>done {counts.completed}</span>
        </div>
      </header>
      <div
        className={
          focused
            ? "grid gap-5 p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,1fr)]"
            : "grid gap-4 p-4 lg:grid-cols-2"
        }
      >
        <DashboardNextUp project={project} focus={focus} onRetryReview={onRetryReview} />
        <div>
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-sm font-medium text-foreground">Recent complete in {name}</h3>
            <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">
              {counts.completed}
            </span>
          </div>
          {completed.length > 0 ? (
            <div className="grid gap-2.5">
              {completed.map((pull) => (
                <CompletedProjectPull
                  key={pull.id}
                  pull={pull}
                  visibleProperties={visibleProperties}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-background/35 px-4 py-5 text-sm text-muted-foreground">
              {name}에서 아직 완료된 Folio 리뷰가 없습니다.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function CompletedProjectPull({
  pull,
  visibleProperties,
}: {
  pull: DashboardCompletedPull;
  visibleProperties: DashboardCardProperty[];
}) {
  const size = sizeMeta(pull.changedFiles, pull.additions + pull.deletions);
  const StateIcon = pull.githubStatus === "merged" ? GitMerge : X;
  return (
    <Link
      href={`/${pull.org}/${pull.repo}/pull/${pull.number}`}
      className="group rounded-lg border border-border bg-background/40 p-3.5 transition-colors hover:border-primary/35"
    >
      <div className="flex items-center justify-between gap-3 font-mono text-[0.65rem] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <StateIcon className="size-3.5 text-syntax-emphasis" />
          {visibleProperties.includes("Repository") ? pull.repo : ""}
          {visibleProperties.includes("ID") ? `#${pull.number}` : ""}
        </span>
        {visibleProperties.includes("Updated date") ? <span>{pull.completedAt}</span> : null}
      </div>
      <h4 className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-primary">
        {pull.title}
      </h4>
      {visibleProperties.includes("Lines changed") ? (
        <div className="mt-3 flex items-center gap-2">
          <SizePill meta={size} />
          <span className="font-mono text-xs text-primary">+{pull.additions}</span>
          <span className="font-mono text-xs text-destructive">-{pull.deletions}</span>
        </div>
      ) : null}
    </Link>
  );
}
