"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitMerge,
  GitPullRequest,
  Github,
} from "lucide-react";
import { useState } from "react";

import { ChapterCards } from "@/components/review/chapter-cards";
import { CommitGraph } from "@/components/review/commit-graph";
import { DiffViewer } from "@/components/review/diff-viewer";
import { Button } from "@/components/ui/button";
import type {
  PullRequestStatus,
  ReviewChapter,
  ReviewCommit,
  ReviewPrMeta,
} from "@/lib/review-api";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  PullRequestStatus,
  { label: string; className: string; icon: typeof GitPullRequest }
> = {
  open: {
    label: "열려 있는",
    className: "border-primary/30 bg-primary/10 text-primary",
    icon: GitPullRequest,
  },
  merged: {
    label: "병합됨",
    className: "border-syntax-emphasis/30 bg-syntax-emphasis/10 text-syntax-emphasis",
    icon: GitMerge,
  },
  closed: {
    label: "닫힘",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: GitPullRequest,
  },
  draft: {
    label: "초안",
    className: "border-border bg-muted text-muted-foreground",
    icon: GitPullRequest,
  },
};

type Tab = "chapters" | "files";

interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  chapterIndex: number;
}

/** Aggregate every chapter's files into a deduped changed-file list for the Files tab. */
function aggregateFiles(chapters: ReviewChapter[]): ChangedFile[] {
  const byPath = new Map<string, ChangedFile>();
  for (const chapter of chapters) {
    for (const file of chapter.files) {
      const existing = byPath.get(file.path);
      if (existing) {
        existing.additions += file.additions;
        existing.deletions += file.deletions;
      } else {
        byPath.set(file.path, {
          path: file.path,
          additions: file.additions,
          deletions: file.deletions,
          chapterIndex: chapter.index,
        });
      }
    }
  }
  return [...byPath.values()];
}

export function ReviewView({
  pr,
  chapters,
  commits,
}: {
  pr: ReviewPrMeta;
  chapters: ReviewChapter[];
  commits: ReviewCommit[];
}) {
  const [tab, setTab] = useState<Tab>("chapters");
  // null = the graph+cards overview; a number = that chapter's in-place diff review.
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const status = STATUS_META[pr.status];
  const StatusIcon = status.icon;
  const files = aggregateFiles(chapters);
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  const openChapter = openIndex === null ? null : chapters.find((c) => c.index === openIndex);
  const nextChapter = openChapter
    ? chapters.find((c) => c.index === openChapter.index + 1)
    : undefined;
  const prevChapter = openChapter
    ? chapters.find((c) => c.index === openChapter.index - 1)
    : undefined;

  return (
    <>
      <div className="shrink-0 px-4 pt-5 md:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium text-xs",
                status.className,
              )}
            >
              <StatusIcon className="size-3.5" />
              {status.label}
            </span>
            <h1 className="min-w-0 font-semibold text-2xl tracking-tight">
              {pr.title}
              <span className="ml-2 font-normal text-muted-foreground">#{pr.number}</span>
            </h1>
          </div>
          <Button
            asChild
            size="icon"
            variant="outline"
            className="size-8 shrink-0"
            aria-label="GitHub에서 보기"
          >
            <a href={pr.htmlUrl} target="_blank" rel="noreferrer">
              <Github className="size-4" />
            </a>
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-sm">
          <span className="flex items-center gap-1.5">
            <GitMerge className="size-3.5" />
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
              {pr.headBranch}
            </code>
            <span className="text-muted-foreground/60">→</span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
              {pr.baseBranch}
            </code>
          </span>
          <span className="font-mono text-xs">{pr.headSha.slice(0, 12)}</span>
          <span className="flex items-center gap-1.5">
            <img
              src={`https://github.com/${pr.author}.png?size=40`}
              alt={pr.author}
              width={20}
              height={20}
              referrerPolicy="no-referrer"
              className="size-5 rounded-full border"
            />
            <span className="text-foreground/80">{pr.author}</span>
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-b">
          <nav className="flex items-center gap-1 overflow-x-auto">
            <TabButton
              active={tab === "chapters"}
              onClick={() => setTab("chapters")}
              icon={BookOpen}
              label="챕터"
              count={chapters.length}
            />
            <TabButton
              active={tab === "files"}
              onClick={() => setTab("files")}
              icon={FileText}
              label="파일이 변경되었습니다"
              count={files.length}
            />
          </nav>
          <span className="flex shrink-0 items-center gap-2 font-mono text-xs tabular-nums">
            <span className="text-diff-add-fg">+{totalAdditions}</span>
            <span className="text-diff-del-fg">-{totalDeletions}</span>
          </span>
        </div>
      </div>

      {tab === "chapters" ? (
        openChapter ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Drill-in: chapter diff with a back link + prev/next, no route change. */}
            <div className="flex shrink-0 items-center gap-2 px-4 py-2.5 md:px-6">
              <Button variant="ghost" size="sm" onClick={() => setOpenIndex(null)}>
                <ChevronLeft className="size-4" />
                개요
              </Button>
              <span className="truncate font-medium text-sm">
                <span className="text-muted-foreground">제{openChapter.index}장 · </span>
                {openChapter.title}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={!prevChapter}
                  onClick={() => prevChapter && setOpenIndex(prevChapter.index)}
                  aria-label="이전 장"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  disabled={!nextChapter}
                  onClick={() => nextChapter && setOpenIndex(nextChapter.index)}
                  aria-label="다음 장"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <DiffViewer chapter={openChapter} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            {/* The differentiator: construction flow (commits) beside review flow (chapters). */}
            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  작업 흐름
                </h2>
                <div className="rounded-lg border bg-card p-2">
                  <CommitGraph commits={commits} />
                </div>
              </section>
              <section>
                <h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  챕터
                </h2>
                <ChapterCards chapters={chapters} onSelect={setOpenIndex} />
              </section>
            </div>
          </div>
        )
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mb-3 text-muted-foreground text-sm">변경된 파일 {files.length}개</div>
          <div className="overflow-hidden rounded-lg border bg-card">
            {files.map((file) => (
              <button
                key={file.path}
                type="button"
                onClick={() => {
                  setTab("chapters");
                  setOpenIndex(file.chapterIndex);
                }}
                className="flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{file.path}</span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  제{file.chapterIndex}장
                </span>
                <span className="shrink-0 font-mono text-diff-add-fg text-xs">
                  +{file.additions}
                </span>
                <span className="shrink-0 font-mono text-diff-del-fg text-xs">
                  -{file.deletions}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof BookOpen;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
        active
          ? "border-primary font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-px text-[11px] tabular-nums",
          active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}
