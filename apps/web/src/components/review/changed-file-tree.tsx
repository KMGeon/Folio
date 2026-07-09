import { CheckCircle2, FileText, Folder } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ChangedFile {
  path: string;
  additions: number;
  deletions: number;
  viewed: boolean;
  chapterIndex: number;
  chapterTitle: string;
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
                  {file.viewed ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <FileText className={cn("size-4 shrink-0", active && "text-primary")} />
                  )}
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
