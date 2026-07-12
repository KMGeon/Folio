"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
  onOpenChange: (open: boolean) => void;
  onSave: (filters: DashboardFilterState) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
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

export function DashboardFilterPanel({
  open,
  filters,
  onOpenChange,
  onSave,
  triggerRef,
}: DashboardFilterPanelProps) {
  const [draftFilters, setDraftFilters] = useState(filters);
  const panelRef = useRef<HTMLElement | null>(null);
  const firstControlRef = useRef<HTMLSelectElement | null>(null);

  const closeAndRestoreFocus = useCallback(() => {
    onOpenChange(false);
    triggerRef.current?.focus();
  }, [onOpenChange, triggerRef]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    // Staging avoids reloading the dashboard while a reviewer is still choosing filters.
    setDraftFilters(filters);
    const focusFrame = window.requestAnimationFrame(() => firstControlRef.current?.focus());
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }
      closeAndRestoreFocus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestoreFocus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeAndRestoreFocus, filters, open, triggerRef]);

  if (!open) {
    return null;
  }

  const patch = (next: Partial<DashboardFilterState>) =>
    setDraftFilters((current) => ({ ...current, ...next }));
  const toggleProperty = (property: DashboardCardProperty) => {
    patch({
      visibleProperties: draftFilters.visibleProperties.includes(property)
        ? draftFilters.visibleProperties.filter((item) => item !== property)
        : [...draftFilters.visibleProperties, property],
    });
  };

  return (
    <aside
      ref={panelRef}
      id="dashboard-filter-menu"
      role="dialog"
      aria-label="Filters and ordering"
      className="absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-card shadow-xs"
    >
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
          Filters &amp; ordering
        </div>
      </div>
      <FilterRow icon={<SlidersHorizontal className="size-3.5" />} label="Ordering">
        <div className="flex gap-2">
          <select
            ref={firstControlRef}
            value={draftFilters.ordering}
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
            onClick={() => patch({ direction: draftFilters.direction === "desc" ? "asc" : "desc" })}
          >
            <ArrowDown className={cn("size-4", draftFilters.direction === "asc" && "rotate-180")} />
          </Button>
        </div>
      </FilterRow>
      <FilterRow label="Closed reviews">
        <select
          value={draftFilters.closedRange}
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
        checked={draftFilters.showDrafts}
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
              aria-pressed={draftFilters.visibleProperties.includes(property)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-mono text-[0.7rem] transition-colors",
                draftFilters.visibleProperties.includes(property)
                  ? "border-border bg-muted text-foreground"
                  : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {property}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t bg-background/40 p-3">
        <Button type="button" variant="ghost" size="sm" onClick={closeAndRestoreFocus}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            onSave(draftFilters);
            closeAndRestoreFocus();
          }}
        >
          Save changes
        </Button>
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
