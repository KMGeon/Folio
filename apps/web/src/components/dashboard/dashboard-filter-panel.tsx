"use client";

import type { ReactNode } from "react";
import { ArrowDown, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  DashboardCardProperty,
  DashboardClosedRange,
  DashboardDirection,
  DashboardGrouping,
  DashboardOrdering,
} from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

export interface DashboardFilterState {
  grouping: DashboardGrouping;
  ordering: DashboardOrdering;
  direction: DashboardDirection;
  closedRange: DashboardClosedRange;
  showDrafts: boolean;
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
      <div className="border-t p-3">
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
    <div className="flex items-center justify-between gap-3 border-b p-3">
      <div className="flex items-center gap-2.5 text-muted-foreground">
        {icon}
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em]">{label}</span>
      </div>
      {children}
    </div>
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
    <label className="flex cursor-pointer items-center justify-between gap-3 border-b p-3">
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
