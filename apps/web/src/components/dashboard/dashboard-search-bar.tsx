"use client";

import { ListFilter, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DashboardSearchBar({
  query,
  onQueryChange,
  onFilterClick,
  onSortClick,
  placeholder = "Search pull requests...",
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onFilterClick: () => void;
  onSortClick: () => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-muted-foreground">
        <Search className="size-4 shrink-0" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label="Search pull requests"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>
      <Button
        type="button"
        aria-label="Filter pull requests"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 text-muted-foreground"
        onClick={onFilterClick}
      >
        <ListFilter className="size-4" />
      </Button>
      <Button
        type="button"
        aria-label="Sort pull requests"
        variant="ghost"
        size="icon"
        className="size-9 shrink-0 text-muted-foreground"
        onClick={onSortClick}
      >
        <SlidersHorizontal className="size-4" />
      </Button>
    </div>
  );
}
