"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { setChapterViewed } from "@/lib/review-api";
import { cn } from "@/lib/utils";

/**
 * Chapter milestone control — primary progress unit for Folio reviews.
 * Not a generic "viewed" chip; completing a chapter is the story-unit done signal.
 */
export function ChapterViewedToggle({
  org,
  repo,
  number,
  index,
  initialViewed,
  focusComplete = false,
  onViewedChange,
}: {
  org: string;
  repo: string;
  number: number;
  index: number;
  initialViewed: boolean;
  /** When all focus items are judged, emphasize the complete CTA. */
  focusComplete?: boolean;
  onViewedChange?: (index: number, viewed: boolean) => void;
}) {
  const router = useRouter();
  const [viewed, setViewed] = useState(initialViewed);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setViewed(initialViewed);
  }, [initialViewed]);

  const onClick = async () => {
    if (pending) {
      return;
    }
    const next = !viewed;
    setViewed(next);
    onViewedChange?.(index, next);
    setPending(true);
    try {
      await setChapterViewed(org, repo, number, index, next);
      router.refresh();
    } catch {
      setViewed(!next);
      onViewedChange?.(index, !next);
    } finally {
      setPending(false);
    }
  };

  const label = viewed ? "챕터 완료" : "이 챕터 마치기";
  const readyToComplete = !viewed && focusComplete;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={viewed}
      aria-label={viewed ? "챕터 완료 해제" : "이 챕터 마치기"}
      title={viewed ? "완료됨 — 클릭해서 해제" : "이 챕터를 마칩니다"}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 font-medium text-xs transition-colors",
        viewed
          ? "border-primary/40 bg-primary/10 text-primary"
          : readyToComplete
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <CheckCircle2 className={cn("size-3.5", !viewed && !readyToComplete && "opacity-70")} />
      )}
      {label}
    </button>
  );
}
