"use client";

import {
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  FileText,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChapterCards } from "@/components/review/chapter-cards";
import { aggregateChangedFiles } from "@/components/review/changed-file-summary";
import { buildFileScopedChapter } from "@/components/review/chapter-file-diff";
import { ChapterPanel } from "@/components/review/chapter-panel";
import { FileStatusMarker, FileTree } from "@/components/review/changed-file-tree";
import { CommitGraph } from "@/components/review/commit-graph";
import { DiffViewModeSwitch, type DiffViewMode } from "@/components/review/diff-view-mode-switch";
import { DiffViewer } from "@/components/review/diff-viewer";
import {
  areFilePathsCollapsed,
  fileProgress,
  setFilePathsCollapsed,
  viewedFileCollapseState,
} from "@/components/review/review-file-state";
import { ReviewPrologue } from "@/components/review/review-prologue";
import { PanelTabButton, type ReviewTab, ReviewTopBar } from "@/components/review/review-top-bar";
import { Button } from "@/components/ui/button";
import type {
  ReviewChapter,
  ReviewCommit,
  ReviewIssueComment,
  ReviewPrMeta,
} from "@/lib/review-api";
import { setFileViewed } from "@/lib/review-api";
import type { Prologue } from "@folio/types";

type ChapterPanelTab = "chapters" | "activity";

export function ReviewView({
  pr,
  prologue,
  chapters,
  comments,
  commits,
  commitsTruncated,
  initialChapterIndex,
}: {
  pr: ReviewPrMeta;
  prologue: Prologue | null;
  chapters: ReviewChapter[];
  comments: ReviewIssueComment[];
  commits: ReviewCommit[];
  commitsTruncated: boolean;
  initialChapterIndex?: number;
}) {
  const [tab, setTab] = useState<ReviewTab>("chapters");
  const [chapterPanelTab, setChapterPanelTab] = useState<ChapterPanelTab>("chapters");
  const [reviewChapters, setReviewChapters] = useState(chapters);
  // null = the graph+cards overview; a number = that chapter's in-place diff review.
  const [openIndex, setOpenIndex] = useState<number | null>(initialChapterIndex ?? null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [diffViewMode, setDiffViewMode] = useState<DiffViewMode>("split");
  const [collapsedFiles, setCollapsedFiles] = useState(() => viewedFileCollapseState(chapters));

  useEffect(() => {
    setReviewChapters(chapters);
    setCollapsedFiles(viewedFileCollapseState(chapters));
  }, [chapters]);

  useEffect(() => {
    setOpenIndex(initialChapterIndex ?? null);
  }, [initialChapterIndex]);

  const files = aggregateChangedFiles(reviewChapters);
  const fileProgressValue = fileProgress(files);
  const selectedFile = useMemo(
    () => files.find((file) => file.path === selectedFilePath) ?? files[0] ?? null,
    [files, selectedFilePath],
  );
  const selectedFileChapter = selectedFile
    ? reviewChapters.find((chapter) => chapter.index === selectedFile.chapterIndex)
    : null;
  const selectedFileScopedChapter =
    selectedFile && selectedFileChapter
      ? buildFileScopedChapter(selectedFileChapter, selectedFile.path)
      : null;
  const totalAdditions = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = files.reduce((sum, file) => sum + file.deletions, 0);

  const openChapter = openIndex === null ? null : reviewChapters.find((c) => c.index === openIndex);
  const nextChapter = openChapter
    ? reviewChapters.find((c) => c.index === openChapter.index + 1)
    : undefined;
  const prevChapter = openChapter
    ? reviewChapters.find((c) => c.index === openChapter.index - 1)
    : undefined;
  const prPath = `/${pr.org}/${pr.repo}/pull/${pr.number}`;
  const openChapterFilePaths = openChapter?.files.map((file) => file.path) ?? [];
  const allOpenChapterFilesCollapsed = areFilePathsCollapsed(collapsedFiles, openChapterFilePaths);

  async function updateFileViewed(path: string, viewed: boolean) {
    setReviewChapters((prev) =>
      prev.map((chapter) => ({
        ...chapter,
        files: chapter.files.map((file) => (file.path === path ? { ...file, viewed } : file)),
      })),
    );
    setCollapsedFiles((current) => setFilePathsCollapsed(current, [path], viewed));
    try {
      await setFileViewed(pr.org, pr.repo, pr.number, path, viewed);
    } catch {
      setReviewChapters((prev) =>
        prev.map((chapter) => ({
          ...chapter,
          files: chapter.files.map((file) =>
            file.path === path ? { ...file, viewed: !viewed } : file,
          ),
        })),
      );
      setCollapsedFiles((current) => setFilePathsCollapsed(current, [path], !viewed));
    }
  }

  function updateFileCollapsed(path: string, collapsed: boolean) {
    setCollapsedFiles((current) => setFilePathsCollapsed(current, [path], collapsed));
  }

  function toggleAllOpenChapterFiles() {
    setCollapsedFiles((current) =>
      setFilePathsCollapsed(current, openChapterFilePaths, !allOpenChapterFilesCollapsed),
    );
  }

  function updateKeyChangeViewed(chapterIndex: number, keyChangeId: string, viewed: boolean) {
    setReviewChapters((prev) =>
      prev.map((chapter) =>
        chapter.index === chapterIndex
          ? {
              ...chapter,
              keyChanges: chapter.keyChanges.map((item) =>
                item.id === keyChangeId ? { ...item, viewed } : item,
              ),
            }
          : chapter,
      ),
    );
  }

  return (
    <>
      <ReviewTopBar
        pr={pr}
        activeTab={tab}
        onTabChange={setTab}
        chapterCount={reviewChapters.length}
        fileCount={files.length}
        viewedFiles={fileProgressValue.viewed}
        totalFiles={fileProgressValue.total}
        totalAdditions={totalAdditions}
        totalDeletions={totalDeletions}
      />

      {tab === "chapters" ? (
        openChapter ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 px-4 py-2.5 md:px-6">
              <Button variant="ghost" size="sm" onClick={() => setOpenIndex(null)}>
                <ChevronLeft className="size-4" />
                개요
              </Button>
              <span className="truncate">
                <span className="font-mono text-xs text-muted-foreground">
                  제{openChapter.index}장 ·{" "}
                </span>
                <span className="font-sans text-base font-medium text-foreground">
                  {openChapter.title}
                </span>
              </span>
              <div className="ml-auto flex items-center gap-1">
                <DiffViewModeSwitch value={diffViewMode} onChange={setDiffViewMode} />
                <Button variant="outline" size="sm" onClick={toggleAllOpenChapterFiles}>
                  {allOpenChapterFilesCollapsed ? (
                    <ChevronsDown className="size-4" />
                  ) : (
                    <ChevronsUp className="size-4" />
                  )}
                  {allOpenChapterFilesCollapsed ? "모두 펴기" : "모두 접기"}
                </Button>
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
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_460px]">
              <DiffViewer
                chapter={openChapter}
                collapsedFiles={collapsedFiles}
                viewMode={diffViewMode}
                onFileViewedChange={updateFileViewed}
                onFileCollapseChange={updateFileCollapsed}
                commentContext={{
                  org: pr.org,
                  repo: pr.repo,
                  number: pr.number,
                  chapterIndex: openChapter.index,
                }}
              />
              <ChapterPanel
                chapters={reviewChapters}
                activeIndex={openChapter.index}
                prPath={prPath}
                org={pr.org}
                repo={pr.repo}
                number={pr.number}
                onKeyChangeViewedChange={updateKeyChangeViewed}
              />
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-6">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
              <section className="min-w-0">
                <ReviewPrologue pr={pr} prologue={prologue} comments={comments} />
              </section>
              <section className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    리뷰
                  </h2>
                  <div className="flex rounded-md bg-muted/60 p-0.5">
                    <PanelTabButton
                      active={chapterPanelTab === "chapters"}
                      label={`챕터 ${reviewChapters.length}`}
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
                  <ChapterCards chapters={reviewChapters} onSelect={setOpenIndex} />
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
          <aside className="flex min-h-72 flex-col overflow-hidden border-b bg-card/35 lg:min-h-0 lg:border-r lg:border-b-0">
            <div className="flex h-12 items-center justify-between border-b px-3">
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
          <main className="min-w-0 overflow-y-auto p-4">
            {selectedFile && selectedFileScopedChapter ? (
              <section className="overflow-hidden rounded-lg border bg-card">
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <FileStatusMarker status={selectedFile.status} active />
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
                  <DiffViewModeSwitch value={diffViewMode} onChange={setDiffViewMode} />
                </div>
                <div className="border-b bg-muted/20 px-3 py-2">
                  <div className="text-muted-foreground text-xs">
                    제{selectedFile.chapterIndex}장
                  </div>
                  <div className="mt-1 font-medium">{selectedFile.chapterTitle}</div>
                </div>
                <DiffViewer
                  chapter={selectedFileScopedChapter}
                  compact
                  collapsedFiles={collapsedFiles}
                  viewMode={diffViewMode}
                  onFileViewedChange={updateFileViewed}
                  onFileCollapseChange={updateFileCollapsed}
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
