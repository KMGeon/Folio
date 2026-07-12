"use client";

import { FileText, Search } from "lucide-react";

import type { ChangedFile } from "@/components/review/changed-file-summary";
import { FileStatusMarker, FileTree } from "@/components/review/changed-file-tree";
import { DiffViewModeSwitch, type DiffViewMode } from "@/components/review/diff-view-mode-switch";
import { DiffViewer } from "@/components/review/diff-viewer";
import type { ReviewChapter, ReviewPrMeta } from "@/lib/review-api";

export function ReviewFilesTab({
  pr,
  files,
  filesTabQuery,
  onFilesTabQueryChange,
  selectedFile,
  selectedFileScopedChapter,
  collapsedFiles,
  diffViewMode,
  onDiffViewModeChange,
  onSelectFile,
  onFileViewedChange,
  onFileCollapseChange,
}: {
  pr: ReviewPrMeta;
  files: ChangedFile[];
  filesTabQuery: string;
  onFilesTabQueryChange: (query: string) => void;
  selectedFile: ChangedFile | null;
  selectedFileScopedChapter: ReviewChapter | null;
  collapsedFiles: Record<string, boolean>;
  diffViewMode: DiffViewMode;
  onDiffViewModeChange: (mode: DiffViewMode) => void;
  onSelectFile: (path: string) => void;
  onFileViewedChange: (path: string, viewed: boolean) => Promise<void>;
  onFileCollapseChange: (path: string, collapsed: boolean) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[24rem_minmax(0,1fr)]">
      <aside className="flex min-h-72 flex-col overflow-hidden border-b bg-card/35 lg:min-h-0 lg:border-r lg:border-b-0">
        <div className="flex h-12 items-center justify-between border-b px-3">
          <div className="flex items-center gap-2 font-medium">
            <FileText className="size-4 text-muted-foreground" />
            파일
            <span className="text-muted-foreground">({files.length})</span>
          </div>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={filesTabQuery}
              onChange={(event) => onFilesTabQueryChange(event.target.value)}
              placeholder="파일 필터링..."
              aria-label="파일 필터링"
              className="h-9 w-full rounded-md border bg-background/55 pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
          </div>
        </div>
        <FileTree
          files={files}
          query={filesTabQuery}
          selectedPath={selectedFile?.path ?? ""}
          onSelect={onSelectFile}
        />
      </aside>
      <main className="min-w-0 overflow-y-auto p-4">
        {selectedFile && selectedFileScopedChapter ? (
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <FileStatusMarker status={selectedFile.status} active />
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{selectedFile.path}</span>
              <span className="font-mono text-diff-add-fg text-sm">+{selectedFile.additions}</span>
              {selectedFile.deletions > 0 ? (
                <span className="font-mono text-diff-del-fg text-sm">
                  -{selectedFile.deletions}
                </span>
              ) : null}
              <DiffViewModeSwitch value={diffViewMode} onChange={onDiffViewModeChange} />
            </div>
            <div className="border-b bg-muted/20 px-3 py-2">
              <div className="text-muted-foreground text-xs">제{selectedFile.chapterIndex}장</div>
              <div className="mt-1 font-medium">{selectedFile.chapterTitle}</div>
            </div>
            <DiffViewer
              chapter={selectedFileScopedChapter}
              compact
              collapsedFiles={collapsedFiles}
              viewMode={diffViewMode}
              onFileViewedChange={onFileViewedChange}
              onFileCollapseChange={onFileCollapseChange}
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
  );
}
