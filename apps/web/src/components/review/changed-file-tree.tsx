"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  FileSymlink,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useState } from "react";

import type { ChangedFile } from "@/components/review/changed-file-summary";
import type { ReviewFileStatus } from "@/lib/review-api";
import { cn } from "@/lib/utils";

import {
  buildChangedFileTree,
  filterChangedFileTree,
  type ChangedFileDirectoryNode,
} from "./changed-file-tree-model";

const FILE_STATUS_META: Record<
  ReviewFileStatus,
  {
    label: string;
    chip: string;
    icon: typeof FilePlus2;
    className: string;
    chipClassName: string;
  }
> = {
  added: {
    label: "추가",
    chip: "A",
    icon: FilePlus2,
    className: "text-diff-add-fg",
    chipClassName: "border-diff-add-fg/30 bg-diff-add-bg text-diff-add-fg",
  },
  modified: {
    label: "수정",
    chip: "M",
    icon: FilePenLine,
    className: "text-muted-foreground",
    chipClassName: "border-border bg-muted/60 text-muted-foreground",
  },
  deleted: {
    label: "삭제",
    chip: "D",
    icon: FileMinus2,
    className: "text-diff-del-fg",
    chipClassName: "border-diff-del-fg/30 bg-diff-del-bg text-diff-del-fg",
  },
  renamed: {
    label: "이름 변경",
    chip: "R",
    icon: FileSymlink,
    className: "text-syntax-link",
    chipClassName: "border-syntax-link/30 bg-syntax-link/10 text-syntax-link",
  },
  moved: {
    label: "이동",
    chip: "V",
    icon: FileSymlink,
    className: "text-syntax-link",
    chipClassName: "border-syntax-link/30 bg-syntax-link/10 text-syntax-link",
  },
};

export function FileStatusMarker({
  status,
  active = false,
}: {
  status: ReviewFileStatus;
  active?: boolean;
}) {
  const meta = FILE_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={meta.label}>
      <Icon className={cn("size-4", meta.className, active && "text-primary")} />
      <span
        className={cn(
          "inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none",
          meta.chipClassName,
          active && status === "modified" && "text-foreground",
        )}
      >
        {meta.chip}
      </span>
    </span>
  );
}

export function FileTree({
  files,
  query = "",
  selectedPath,
  onSelect,
}: {
  files: ChangedFile[];
  query?: string;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const tree = buildChangedFileTree(files);
  const filteredTree = filterChangedFileTree(tree, query);
  const [collapsedDirectories, setCollapsedDirectories] = useState<Set<string>>(new Set());

  function toggleDirectory(path: string) {
    setCollapsedDirectories((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3">
      {filteredTree.directories.map((directory) => (
        <DirectoryBranch
          key={directory.path}
          directory={directory}
          collapsedDirectories={collapsedDirectories}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onToggle={toggleDirectory}
        />
      ))}
      {filteredTree.files.map((file) => (
        <FileTreeRow key={file.path} file={file} selectedPath={selectedPath} onSelect={onSelect} />
      ))}
    </div>
  );
}

function DirectoryBranch({
  directory,
  collapsedDirectories,
  selectedPath,
  onSelect,
  onToggle,
}: {
  directory: ChangedFileDirectoryNode;
  collapsedDirectories: Set<string>;
  selectedPath: string;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const collapsed = collapsedDirectories.has(directory.path);
  const FolderIcon = collapsed ? Folder : FolderOpen;

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(directory.path)}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-muted-foreground text-xs hover:bg-accent hover:text-foreground"
        aria-expanded={!collapsed}
        title={directory.path}
      >
        {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        <FolderIcon className="size-3.5" />
        <span className="min-w-0 truncate font-mono tracking-tight">{directory.name}</span>
      </button>
      {collapsed ? null : (
        <div className="ml-2.5 border-border/60 border-l pl-1.5">
          {directory.directories.map((child) => (
            <DirectoryBranch
              key={child.path}
              directory={child}
              collapsedDirectories={collapsedDirectories}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
          {directory.files.map((file) => (
            <FileTreeRow
              key={file.path}
              file={file}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileTreeRow({
  file,
  selectedPath,
  onSelect,
}: {
  file: ChangedFile;
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const name = file.path.split("/").at(-1) ?? file.path;
  const active = file.path === selectedPath;

  return (
    <button
      type="button"
      onClick={() => onSelect(file.path)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent",
      )}
    >
      <FileStatusMarker status={file.status} active={active} />
      {file.viewed ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : null}
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{name}</span>
      <span className="shrink-0 font-mono text-diff-add-fg text-xs">+{file.additions}</span>
      {file.deletions > 0 ? (
        <span className="shrink-0 font-mono text-diff-del-fg text-xs">-{file.deletions}</span>
      ) : null}
    </button>
  );
}
