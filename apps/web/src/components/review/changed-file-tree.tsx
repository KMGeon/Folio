import {
  CheckCircle2,
  FileMinus2,
  FilePenLine,
  FilePlus2,
  FileSymlink,
  Folder,
} from "lucide-react";

import type { ChangedFile } from "@/components/review/changed-file-summary";
import type { ReviewFileStatus } from "@/lib/review-api";
import { cn } from "@/lib/utils";

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
    label: "Added",
    chip: "A",
    icon: FilePlus2,
    className: "text-diff-add-fg",
    chipClassName: "border-diff-add-fg/30 bg-diff-add-bg text-diff-add-fg",
  },
  modified: {
    label: "Modified",
    chip: "M",
    icon: FilePenLine,
    className: "text-muted-foreground",
    chipClassName: "border-border bg-muted/60 text-muted-foreground",
  },
  deleted: {
    label: "Deleted",
    chip: "D",
    icon: FileMinus2,
    className: "text-diff-del-fg",
    chipClassName: "border-diff-del-fg/30 bg-diff-del-bg text-diff-del-fg",
  },
  renamed: {
    label: "Renamed",
    chip: "R",
    icon: FileSymlink,
    className: "text-syntax-link",
    chipClassName: "border-syntax-link/30 bg-syntax-link/10 text-syntax-link",
  },
  moved: {
    label: "Moved",
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
  selectedPath,
  onSelect,
}: {
  files: ChangedFile[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  const groups = new Map<string, ChangedFile[]>();
  for (const file of files) {
    const parts = file.path.split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    groups.set(dir, [...(groups.get(dir) ?? []), file]);
  }

  return (
    <div className="min-h-0 overflow-y-auto p-3">
      {[...groups.entries()].map(([dir, dirFiles]) => (
        <div key={dir} className="mb-3 last:mb-0">
          <div className="mb-1 flex items-center gap-2 px-2 py-1 text-muted-foreground text-sm">
            <Folder className="size-4" />
            <span className="min-w-0 truncate">{dir}</span>
          </div>
          <div className="space-y-1">
            {dirFiles.map((file) => {
              const name = file.path.split("/").at(-1) ?? file.path;
              const active = file.path === selectedPath;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => onSelect(file.path)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  <FileStatusMarker status={file.status} active={active} />
                  {file.viewed ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : null}
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{name}</span>
                  <span className="font-mono text-diff-add-fg text-xs">+{file.additions}</span>
                  {file.deletions > 0 ? (
                    <span className="font-mono text-diff-del-fg text-xs">-{file.deletions}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
