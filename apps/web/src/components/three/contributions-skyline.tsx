"use client";

import dynamic from "next/dynamic";

import type { ActivityDay } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";

// R3F must stay client-only; skip SSR so the dashboard server page still renders.
const Scene = dynamic(
  () => import("./contributions-skyline-scene").then((m) => m.ContributionsSkylineScene),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse rounded-md bg-muted/20" />,
  },
);

// Mirrors the scene's level palette for the small 2D legend (vivid green ramp).
const LEGEND = ["#1f2329", "#1c6b3f", "#2a9d5c", "#3fd97e", "#7defa8"];

/** 3D "skyline" of the user's daily review activity over the last year. */
export function ContributionsSkyline({ activity }: { activity: ActivityDay[] }) {
  const total = activity.reduce((sum, a) => sum + a.count, 0);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-base italic leading-none">활동</h2>
        <span className="text-xs text-muted-foreground">최근 1년 · 기여 {total}개</span>
      </div>

      <div className="h-72 w-full overflow-hidden rounded-md">
        <Scene activity={activity} />
      </div>

      <div className="flex items-center justify-end gap-1 pt-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {LEGEND.map((color) => (
          <span
            key={color}
            className={cn("size-[11px] rounded-[2px]")}
            style={{ backgroundColor: color }}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  );
}
