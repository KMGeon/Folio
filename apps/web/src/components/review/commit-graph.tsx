"use client";

import { GitBranch, GitCommitVertical, GitMerge, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { ReviewPrMeta } from "@/lib/review-api";
import type { ReviewCommit } from "@/lib/review-api";
import { cn } from "@/lib/utils";

const INITIAL_VISIBLE_COMMITS = 12;
const VISIBLE_COMMIT_STEP = 12;

function relativeTime(iso: string): string {
  if (!iso) {
    return "";
  }
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return "";
  }
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) {
    return "방금";
  }
  if (minutes < 60) {
    return `${minutes}분 전`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}시간 전`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}일 전`;
  }
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}개월 전` : `${Math.floor(months / 12)}년 전`;
}

/**
 * A single PR's commit timeline as a vertical-lane graph (newest first). Merge
 * commits get a hollow node; `highlightedShas` dims everything else.
 */
export function CommitGraph({
  commits,
  highlightedShas,
  pr,
}: {
  commits: ReviewCommit[];
  highlightedShas?: Set<string>;
  pr?: ReviewPrMeta;
}) {
  const ordered = useMemo(() => [...commits].reverse(), [commits]);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(INITIAL_VISIBLE_COMMITS, ordered.length),
  );
  useEffect(() => {
    setVisibleCount((count) =>
      Math.min(Math.max(count, Math.min(INITIAL_VISIBLE_COMMITS, ordered.length)), ordered.length),
    );
  }, [ordered.length]);
  const visible = useMemo(() => ordered.slice(0, visibleCount), [ordered, visibleCount]);
  const hasFocus = Boolean(highlightedShas && highlightedShas.size > 0);
  const hasMore = visibleCount < ordered.length;

  if (commits.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        커밋 정보를 불러올 수 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background/40">
      <div className="grid grid-cols-[minmax(11rem,0.58fr)_minmax(13rem,0.74fr)_minmax(0,1.7fr)] border-b bg-muted/35 px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        <span>Branch / Tag</span>
        <span>Graph</span>
        <span>Commit message</span>
      </div>
      <div
        className="max-h-[30rem] overflow-y-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (distanceToBottom < 96 && hasMore) {
            setVisibleCount((count) => Math.min(count + VISIBLE_COMMIT_STEP, ordered.length));
          }
        }}
      >
        {visible.map((commit, i) => {
          const globalIndex = i;
          const isMerge = commit.parents.length > 1;
          const dim = hasFocus && !highlightedShas?.has(commit.sha);
          const lane = commit.branch === "head" ? 0 : 1;
          const next = ordered[globalIndex + 1];
          const nextLane = next ? (next.branch === "head" ? 0 : 1) : lane;
          const showHeadLabel =
            pr &&
            commit.branch === "head" &&
            !ordered.slice(0, globalIndex).some((c) => c.branch === "head");
          const showBaseLabel =
            pr &&
            commit.branch === "base" &&
            !ordered.slice(0, globalIndex).some((c) => c.branch === "base");
          return (
            <div
              key={commit.sha}
              className={cn(
                "grid min-h-14 grid-cols-[minmax(11rem,0.58fr)_minmax(13rem,0.74fr)_minmax(0,1.7fr)] border-b transition-opacity",
                dim && "opacity-35",
              )}
            >
              <div className="flex min-w-0 items-center gap-2 px-3 py-2">
                {showHeadLabel ? (
                  <BranchBadge label={pr.headBranch} tone="head" />
                ) : showBaseLabel ? (
                  <BranchBadge label={pr.baseBranch} tone="base" />
                ) : null}
              </div>
              <div className="relative min-h-14 overflow-hidden px-3">
                <GraphLane
                  lane={lane}
                  nextLane={nextLane}
                  isFirst={globalIndex === 0}
                  isLast={globalIndex === ordered.length - 1}
                />
                <span
                  className={cn(
                    "absolute top-1/2 z-10 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-card",
                    laneClass(lane, "left"),
                    isMerge
                      ? "border-syntax-emphasis text-syntax-emphasis"
                      : "border-primary text-primary",
                  )}
                  aria-hidden="true"
                >
                  {isMerge ? (
                    <GitMerge className="size-3" />
                  ) : (
                    <GitCommitVertical className="size-3" />
                  )}
                </span>
              </div>
              <div className="min-w-0 px-3 py-2.5">
                <div className="truncate font-medium text-sm text-foreground">
                  {commit.message.split("\n")[0]}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                    {commit.sha.slice(0, 7)}
                  </code>
                  <span>{commit.author}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span>{relativeTime(commit.authoredAt)}</span>
                  {isMerge ? (
                    <span className="rounded bg-syntax-emphasis/10 px-1.5 py-px text-[10px] text-syntax-emphasis">
                      merge
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {hasMore ? (
          <div className="border-t px-3 py-3 text-center text-muted-foreground text-xs">
            스크롤하면 커밋 {Math.min(VISIBLE_COMMIT_STEP, ordered.length - visibleCount)}개를 더
            불러옵니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BranchBadge({ label, tone }: { label: string; tone: "head" | "base" }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs",
        tone === "head" ? "bg-info/15 text-info" : "bg-syntax-emphasis/15 text-syntax-emphasis",
      )}
    >
      {tone === "head" ? <GitBranch className="size-3" /> : <Tag className="size-3" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

function laneClass(lane: number, axis: "left" | "bg") {
  const left = ["left-8", "left-16", "left-24"][lane] ?? "left-8";
  const bg = ["bg-primary", "bg-info", "bg-syntax-emphasis"][lane] ?? "bg-primary";
  return axis === "left" ? left : bg;
}

function GraphLane({
  lane,
  nextLane,
  isFirst,
  isLast,
}: {
  lane: number;
  nextLane: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <>
      {!isFirst ? (
        <span
          className={cn(
            "absolute top-0 h-1/2 w-0.5",
            laneClass(lane, "left"),
            laneClass(lane, "bg"),
          )}
          aria-hidden="true"
        />
      ) : null}
      {!isLast ? (
        <span
          className={cn(
            "absolute bottom-0 h-1/2 w-0.5",
            laneClass(nextLane, "left"),
            laneClass(nextLane, "bg"),
          )}
          aria-hidden="true"
        />
      ) : null}
      {!isLast && lane !== nextLane ? (
        <span
          className={cn(
            "absolute top-1/2 h-0.5 -translate-y-1/2",
            laneClass(Math.min(lane, nextLane), "left"),
            laneClass(lane, "bg"),
            Math.abs(lane - nextLane) === 1 ? "w-8" : "w-16",
          )}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
