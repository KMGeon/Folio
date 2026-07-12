import { cn } from "@/lib/utils";

export type SizeMeta = { label: string; tone: "green" | "amber" | "red" };

/**
 * Signature "reading spine": one hairline tick per chapter, filled once viewed —
 * the PR shown as a book you read down. Chapter order is real, so the sequence
 * carries meaning rather than decorating.
 */
export function ReadingSpine({ total, viewed }: { total: number; viewed: number }) {
  if (total <= 0) {
    return null;
  }
  const shown = Math.min(total, 14);
  return (
    <span
      className="flex items-center gap-[3px]"
      title={`${viewed}/${total} chapters read`}
      aria-label={`${total}개 챕터 중 ${viewed}개 읽음`}
    >
      {Array.from({ length: shown }).map((_, i) => (
        <span
          key={i}
          className={cn("h-3.5 w-[2px] rounded-full", i < viewed ? "bg-primary" : "bg-border")}
        />
      ))}
      <span className="ml-1.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
        {viewed}/{total}
      </span>
    </span>
  );
}

export function SizePill({ meta }: { meta: SizeMeta }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.tone === "green" && "border-primary/30 bg-primary/10 text-primary",
        meta.tone === "amber" && "border-warning/40 bg-warning/10 text-warning",
        meta.tone === "red" && "border-destructive/40 bg-destructive/10 text-destructive",
      )}
    >
      {meta.label}
    </span>
  );
}

export function sizeMeta(changedFiles: number, churn: number): SizeMeta {
  if (changedFiles <= 2 && churn <= 30) {
    return { label: "size/XS", tone: "green" };
  }
  if (changedFiles <= 5 && churn <= 150) {
    return { label: "size/S", tone: "green" };
  }
  if (changedFiles <= 12 && churn <= 600) {
    return { label: "size/M", tone: "amber" };
  }
  if (changedFiles <= 25 && churn <= 1500) {
    return { label: "size/L", tone: "amber" };
  }
  return { label: "size/XXL", tone: "red" };
}
