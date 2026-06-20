"use client";

import type { ReviewCommit } from "@/lib/review-api";
import { cn } from "@/lib/utils";

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
}: {
  commits: ReviewCommit[];
  highlightedShas?: Set<string>;
}) {
  if (commits.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        커밋 정보를 불러올 수 없습니다.
      </div>
    );
  }

  const ordered = [...commits].reverse();
  const hasFocus = Boolean(highlightedShas && highlightedShas.size > 0);

  return (
    <div className="flex flex-col">
      {ordered.map((commit, i) => {
        const isMerge = commit.parents.length > 1;
        const isLast = i === ordered.length - 1;
        const dim = hasFocus && !highlightedShas?.has(commit.sha);
        return (
          <div
            key={commit.sha}
            className={cn("flex gap-3 px-1 transition-opacity", dim && "opacity-30")}
          >
            <div className="relative flex w-4 shrink-0 flex-col items-center">
              <span
                className={cn(
                  "z-10 mt-3 size-3 shrink-0 rounded-full border-2",
                  isMerge ? "border-syntax-emphasis bg-background" : "border-primary bg-primary",
                )}
              />
              {isLast ? null : <span className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn("min-w-0 flex-1 border-b py-2.5", isLast && "border-b-0")}>
              <div className="truncate text-sm text-foreground">
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
    </div>
  );
}
