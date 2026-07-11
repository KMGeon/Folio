"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  disabled = false,
  label,
  describedBy,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  describedBy?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-describedby={describedBy}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-5 w-9 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-input bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-0.5 size-3.5 rounded-full bg-primary-foreground transition-transform",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
