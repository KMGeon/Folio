import { cn } from "@/lib/utils";

export type DiffViewMode = "unified" | "split";

export function DiffViewModeSwitch({
  value,
  onChange,
}: {
  value: DiffViewMode;
  onChange: (mode: DiffViewMode) => void;
}) {
  return (
    <div
      className="flex shrink-0 rounded-md border bg-background p-0.5 text-xs"
      role="group"
      aria-label="Diff 보기 방식"
    >
      {(["unified", "split"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={cn(
            "h-6 rounded px-2 font-medium transition-colors",
            value === mode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          aria-pressed={value === mode}
        >
          {mode === "unified" ? "Unified" : "Split"}
        </button>
      ))}
    </div>
  );
}
