"use client";

import { FolderGit2, LayoutGrid } from "lucide-react";
import type { ReactNode } from "react";

import {
  dashboardProjectCounts,
  dashboardProjectName,
  type DashboardProjectData,
} from "@/components/dashboard/dashboard-project-desk-model";
import { cn } from "@/lib/utils";

export function DashboardProjectSidebar({
  projects,
  activeRepoId,
  onSelect,
}: {
  projects: DashboardProjectData[];
  activeRepoId: string | null;
  onSelect: (repoId: string | null) => void;
}) {
  const readyTotal = projects.reduce(
    (total, project) => total + dashboardProjectCounts(project).ready,
    0,
  );

  return (
    <aside className="min-w-0 rounded-xl border border-border bg-card/70 p-2 lg:sticky lg:top-4 lg:self-start">
      <p className="px-2 py-1.5 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
        Projects
      </p>
      <nav aria-label="Projects" className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
        <ProjectButton
          active={activeRepoId === null}
          icon={<LayoutGrid className="size-3.5" />}
          name="All projects"
          detail={`workspace · ${projects.length} enabled`}
          ready={readyTotal}
          onClick={() => onSelect(null)}
        />
        {projects.map((project) => (
          <ProjectButton
            key={project.repo.id}
            active={activeRepoId === project.repo.id}
            icon={<FolderGit2 className="size-3.5" />}
            name={dashboardProjectName(project.repo.fullName)}
            detail={project.repo.fullName}
            ready={dashboardProjectCounts(project).ready}
            onClick={() => onSelect(project.repo.id)}
          />
        ))}
      </nav>
    </aside>
  );
}

function ProjectButton({
  active,
  icon,
  name,
  detail,
  ready,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  name: string;
  detail: string;
  ready: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors",
        active
          ? "border-primary/25 bg-primary/8 text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span className={cn("text-muted-foreground", active && "text-primary")}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        <span className="block truncate font-mono text-[0.65rem]">{detail}</span>
      </span>
      <span
        className={cn(
          "min-w-6 rounded-full border px-1.5 py-0.5 text-center font-mono text-[0.65rem] tabular-nums",
          ready > 0 ? "border-primary/30 bg-primary/10 text-primary" : "border-border",
        )}
      >
        {ready}
      </span>
    </button>
  );
}
