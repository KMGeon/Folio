"use client";

import { FolderGit2, LayoutGrid } from "lucide-react";

import {
  dashboardProjectName,
  type DashboardQueueFocus,
  type DashboardScopeCounts,
} from "@/components/dashboard/dashboard-project-desk-model";
import type { DashboardRepo } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export function DashboardProjectBar({
  activeRepo,
  repoCount,
  counts,
  focus,
  onFocusChange,
}: {
  activeRepo: DashboardRepo | null;
  repoCount: number;
  counts: DashboardScopeCounts;
  focus: DashboardQueueFocus;
  onFocusChange: (focus: DashboardQueueFocus) => void;
}) {
  const name = activeRepo ? dashboardProjectName(activeRepo.fullName) : "All projects";
  const detail = activeRepo
    ? `${activeRepo.fullName} · ${activeRepo.folioEnabled ? "Folio enabled" : "not enabled"}`
    : `${repoCount} repos · grouped by project`;
  const ScopeIcon = activeRepo ? FolderGit2 : LayoutGrid;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-primary">
          <ScopeIcon className="size-4" />
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-sm font-medium text-foreground">{name}</strong>
          <span className="block truncate font-mono text-[0.65rem] text-muted-foreground">
            {detail}
          </span>
        </span>
      </div>
      <div className="flex w-fit items-center gap-1 rounded-full border border-border bg-background/50 p-1">
        <QueueChip
          label="Ready"
          value={counts.ready}
          active={focus === "ready"}
          onClick={() => onFocusChange("ready")}
        />
        <QueueChip
          label="Yours"
          value={counts.yours}
          active={focus === "yours"}
          onClick={() => onFocusChange("yours")}
        />
        <QueueChip
          label="Complete"
          value={counts.completed}
          active={focus === "completed"}
          onClick={() => onFocusChange("completed")}
        />
      </div>
    </section>
  );
}

function QueueChip({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs transition-colors",
        active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <strong className={cn("font-medium tabular-nums text-foreground", active && "text-primary")}>
        {value}
      </strong>
    </button>
  );
}
