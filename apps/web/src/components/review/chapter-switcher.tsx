"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** "제 N 장 ▾" dropdown that jumps to any chapter. */
export function ChapterSwitcher({
  chapters,
  activeIndex,
  prPath,
}: {
  chapters: { index: number; title: string }[];
  activeIndex: number;
  prPath: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-sm font-medium hover:bg-accent"
        aria-expanded={open}
      >
        제 {activeIndex} 장
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-1 max-h-72 w-64 overflow-y-auto rounded-md border bg-card p-1 shadow-md">
          {chapters.map((c) => (
            <Link
              key={c.index}
              href={`${prPath}/chapters/${c.index}`}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                c.index === activeIndex && "bg-accent text-foreground",
              )}
            >
              <span className="w-5 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {c.index}
              </span>
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
