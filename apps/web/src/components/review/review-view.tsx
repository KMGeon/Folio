"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitMerge,
  GitPullRequest,
  Github,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";

import { ChapterCards } from "@/components/review/chapter-cards";
import { aggregateChangedFiles } from "@/components/review/changed-file-summary";
import { buildFileScopedChapter } from "@/components/review/chapter-file-diff";
import { FileTree } from "@/components/review/changed-file-tree";
import { CommitGraph } from "@/components/review/commit-graph";
import { DiffViewer } from "@/components/review/diff-viewer";
import { ReviewPrologue } from "@/components/review/review-prologue";
import { PanelTabButton, TabButton } from "@/components/review/review-tab-buttons";
import { Button } from "@/components/ui/button";
import type {
  PullRequestStatus,
  ReviewChapter,
  ReviewCommit,
  ReviewIssueComment,
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
type ChapterPanelTab = "chapters" | "activity";

export function ReviewView({
  pr,
  chapters,
  comments,
  commits,
  commitsTruncated,
}: {
  pr: ReviewPrMeta;
  chapters: ReviewChapter[];
  comments: ReviewIssueComment[];
  commits: ReviewCommit[];
  commitsTruncated: boolean;
}) {
  const [tab, setTab] = useState<Tab>("chapters");
  const [chapterPanelTab, setChapterPanelTab] = useState<ChapterPanelTab>("chapters");
  // null = the graph+cards overview; a number = that chapter's in-place diff review.
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);

  const status = STATUS_META[pr.status];
  const StatusIcon = status.icon;
  const files = aggregateChangedFiles(chapters);
  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedFilePath) ?? files[0] ?? null,
    [files, selectedFilePath],
  );
  const selectedFileChapter = selectedFile
    ? chapters.find((chapter) => chapter.index === selectedFile.chapterIndex)
    : null;
  const selectedFileScopedChapter =
    selectedFile && selectedFileChapter
      ? buildFileScopedChapter(selectedFileChapter, selectedFile.path)
      : null;
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
            <span className="text-muted-foreground/60">-&gt;</span>
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
            <DiffViewer
              chapter={openChapter}
              commentContext={{
                org: pr.org,
                repo: pr.repo,
                number: pr.number,
                chapterIndex: openChapter.index,
              }}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
              <section>
                <ReviewPrologue pr={pr} comments={comments} />
              </section>
              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    리뷰
                  </h2>
                  <div className="flex rounded-md bg-muted/60 p-0.5">
                    <PanelTabButton
                      active={chapterPanelTab === "chapters"}
                      label={`챕터 ${chapters.length}`}
                      onClick={() => setChapterPanelTab("chapters")}
                    />
                    <PanelTabButton
                      active={chapterPanelTab === "activity"}
                      label={`활동 ${commits.length}${commitsTruncated ? "+" : ""}`}
                      onClick={() => setChapterPanelTab("activity")}
                    />
                  </div>
                </div>
                {chapterPanelTab === "chapters" ? (
                  <ChapterCards chapters={chapters} onSelect={setOpenIndex} />
                ) : (
                  <div className="rounded-lg border bg-card p-2">
                    <CommitGraph commits={commits} pr={pr} />
                  </div>
                )}
              </section>
            </div>
          </div>
        )
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[24rem_minmax(0,1fr)]">
          <aside className="min-h-72 border-b bg-card/35 lg:min-h-0 lg:border-r lg:border-b-0">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2 font-medium">
                <FileText className="size-4 text-muted-foreground" />
                Files
                <span className="text-muted-foreground">({files.length})</span>
              </div>
            </div>
            <div className="border-b p-3">
              <div className="flex h-9 items-center gap-2 rounded-md border bg-background/55 px-3 text-muted-foreground text-sm">
                <Search className="size-4" />
                <span>Filter files...</span>
              </div>
            </div>
            <FileTree
              files={files}
              selectedPath={selectedFile?.path ?? ""}
              onSelect={setSelectedFilePath}
            />
          </aside>
          <main className="min-w-0 overflow-y-auto p-6">
            {selectedFile && selectedFileScopedChapter ? (
              <section className="overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center gap-3 border-b px-4 py-3">
                  <FileText className="size-4 text-primary" />
                  <span className="min-w-0 flex-1 truncate font-mono text-sm">
                    {selectedFile.path}
                  </span>
                  <span className="font-mono text-diff-add-fg text-sm">
                    +{selectedFile.additions}
                  </span>
                  {selectedFile.deletions > 0 ? (
                    <span className="font-mono text-diff-del-fg text-sm">
                      -{selectedFile.deletions}
                    </span>
                  ) : null}
                </div>
                <div className="border-b bg-muted/20 px-4 py-3">
                  <div className="text-muted-foreground text-xs">
                    제{selectedFile.chapterIndex}장
                  </div>
                  <div className="mt-1 font-medium">{selectedFile.chapterTitle}</div>
                </div>
                <DiffViewer
                  chapter={selectedFileScopedChapter}
                  compact
                  commentContext={{
                    org: pr.org,
                    repo: pr.repo,
                    number: pr.number,
                    chapterIndex: selectedFileScopedChapter.index,
                    path: selectedFile.path,
                  }}
                />
              </section>
            ) : (
              <div className="flex min-h-60 items-center justify-center rounded-lg border bg-card text-muted-foreground text-sm">
                변경된 파일이 없습니다.
              </div>
            )}
          </main>
        </div>
      )}
    </>
  );
}
