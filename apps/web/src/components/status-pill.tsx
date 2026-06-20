import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

export type ReviewStatus = "ready" | "processing" | "stale" | "error";
export type RiskLevel = "low" | "medium" | "high";

const statusMeta: Record<
  ReviewStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  ready: {
    label: "리뷰 준비",
    icon: CheckCircle2,
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  processing: {
    label: "챕터 생성 중",
    icon: Clock3,
    className: "border-info/30 bg-info/10 text-info",
  },
  stale: {
    label: "새 커밋 감지",
    icon: RefreshCw,
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  error: {
    label: "확인 필요",
    icon: AlertTriangle,
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

const riskMeta: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "낮은 위험", className: "border-primary/30 text-primary" },
  medium: { label: "중간 위험", className: "border-warning/40 text-warning" },
  high: { label: "높은 위험", className: "border-destructive/40 text-destructive" },
};

export function StatusPill({ status }: { status: ReviewStatus }) {
  const meta = statusMeta[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

export function RiskPill({ risk }: { risk: RiskLevel }) {
  const meta = riskMeta[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}
