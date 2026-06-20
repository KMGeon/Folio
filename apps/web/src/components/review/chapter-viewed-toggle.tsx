"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { setChapterViewed } from "@/lib/review-api";
import { cn } from "@/lib/utils";

/** Click-to-toggle "viewed" mark for one chapter; persists to the backend. */
export function ChapterViewedToggle({
  org,
  repo,
  number,
  index,
  initialViewed,
}: {
  org: string;
  repo: string;
  number: number;
  index: number;
  initialViewed: boolean;
}) {
  const router = useRouter();
  const [viewed, setViewed] = useState(initialViewed);
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (pending) {
      return;
    }
    const next = !viewed;
    setViewed(next); // optimistic
    setPending(true);
    try {
      await setChapterViewed(org, repo, number, index, next);
      // Refresh server components so progress (dashboard, list) reflects the change.
      router.refresh();
    } catch {
      setViewed(!next); // revert on failure
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={viewed}
      aria-label={viewed ? "읽음 해제" : "읽음으로 표시"}
      title={viewed ? "읽음 — 클릭해서 해제" : "읽음으로 표시"}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
        viewed ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : viewed ? (
        <CheckCircle2 className="size-4" />
      ) : (
        <Circle className="size-4" />
      )}
    </button>
  );
}
