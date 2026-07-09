"use client";

import type { ReactNode } from "react";
import { ArrowDown, Grid2X2, Layers3, LayoutList, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DashboardCardProperty,
  DashboardClosedRange,
  DashboardDirection,
  DashboardGrouping,
  DashboardLayoutMode,
  DashboardOrdering,
} from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export interface DashboardFilterState {
  layout: DashboardLayoutMode;
  grouping: DashboardGrouping;
  ordering: DashboardOrdering;
  direction: DashboardDirection;
  closedRange: DashboardClosedRange;
  showDrafts: boolean;
  showEmptyColumns: boolean;
  highlightMyPrs: boolean;
  visibleProperties: DashboardCardProperty[];
}

export interface DashboardFilterPanelProps {
  open: boolean;
  filters: DashboardFilterState;
  onChange: (filters: DashboardFilterState) => void;
}

const propertyOptions: DashboardCardProperty[] = [
  "Repository",
  "ID",
  "Author",
  "Labels",
  "Reviewers",
  "Lines changed",
  "CI status",
  "Comments",
  "Chapters",
  "Preview environments",
  "Updated date",
];

export function DashboardFilterPanel({ open, filters, onChange }: DashboardFilterPanelProps) {
  if (!open) {
    return null;
  }

  const patch = (next: Partial<DashboardFilterState>) => onChange({ ...filters, ...next });
  const toggleProperty = (property: DashboardCardProperty) => {
    patch({
      visibleProperties: filters.visibleProperties.includes(property)
        ? filters.visibleProperties.filter((item) => item !== property)
        : [...filters.visibleProperties, property],
    });
  };

  return (
    <aside className="absolute right-0 top-12 z-30 w-full max-w-[352px] overflow-hidden rounded-lg border bg-card shadow-lg md:right-6">
      <FilterRow icon={<Grid2X2 className="size-3.5" />} label="Layout">
        <div className="flex rounded-md bg-background/50 p-1">
          <SegmentButton
            active={filters.layout === "board"}
            onClick={() => patch({ layout: "board" })}
          >
            Board
          </SegmentButton>
          <SegmentButton
            active={filters.layout === "list"}
            onClick={() => patch({ layout: "list" })}
          >
            <LayoutList className="size-3.5" />
            List
          </SegmentButton>
        </div>
      </FilterRow>
      <FilterRow icon={<Layers3 className="size-3.5" />} label="Grouping">
        <select
          value={filters.grouping}
          onChange={(event) => patch({ grouping: event.target.value as DashboardGrouping })}
          aria-label="Grouping"
          className="h-8 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring"
        >
          <option value="responsibility">Responsibility</option>
          <option value="repository">Repository</option>
        </select>
      </FilterRow>
      <FilterRow icon={<SlidersHorizontal className="size-3.5" />} label="Ordering">
        <div className="flex gap-2">
          <select
            value={filters.ordering}
            onChange={(event) => patch({ ordering: event.target.value as DashboardOrdering })}
            aria-label="Ordering"
            className="h-8 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring"
          >
            <option value="updated">Updated</option>
            <option value="lines">Lines changed</option>
          </select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Toggle ordering direction"
            onClick={() => patch({ direction: filters.direction === "desc" ? "asc" : "desc" })}
          >
            <ArrowDown className={cn("size-4", filters.direction === "asc" && "rotate-180")} />
          </Button>
        </div>
      </FilterRow>
      <FilterRow label="Closed reviews">
        <select
          value={filters.closedRange}
          onChange={(event) => patch({ closedRange: event.target.value as DashboardClosedRange })}
          aria-label="Closed reviews"
          className="h-8 rounded-md border bg-background px-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-ring"
        >
          <option value="all">All time</option>
          <option value="1d">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </FilterRow>
      <ToggleRow
        label="Show drafts"
        checked={filters.showDrafts}
        onChange={(showDrafts) => patch({ showDrafts })}
      />
      <ToggleRow
        label="Show empty columns"
        checked={filters.showEmptyColumns}
        onChange={(showEmptyColumns) => patch({ showEmptyColumns })}
      />
      <ToggleRow
        label="Highlight my PRs"
        checked={filters.highlightMyPrs}
        onChange={(highlightMyPrs) => patch({ highlightMyPrs })}
      />
      <div className="border-t p-4">
        <div className="mb-3 font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Display properties
        </div>
        <div className="flex flex-wrap gap-2">
          {propertyOptions.map((property) => (
            <button
              key={property}
              type="button"
              onClick={() => toggleProperty(property)}
              aria-pressed={filters.visibleProperties.includes(property)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[0.7rem] transition-colors",
                filters.visibleProperties.includes(property)
                  ? "border-border bg-muted text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {property}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function FilterRow({
  icon,
  label,
  children,
}: {
  icon?: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b p-4">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        {icon}
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em]">{label}</span>
      </div>
      {children}
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded px-3 text-xs transition-colors",
        active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-b p-4">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-primary"
      />
    </label>
  );
}
