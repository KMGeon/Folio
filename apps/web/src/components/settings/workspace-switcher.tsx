"use client";

import { Building2, ChevronDown, Loader2, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { selectWorkspace, type WorkspaceOption } from "@/lib/workspace-permission";

type WorkspaceSwitcherProps = {
  workspaces: WorkspaceOption[];
  selectedWorkspaceId: string | null;
};

export function WorkspaceSwitcher({ workspaces, selectedWorkspaceId }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(selectedWorkspaceId ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedId);

  useEffect(() => {
    setSelectedId(selectedWorkspaceId ?? "");
  }, [selectedWorkspaceId]);

  const changeWorkspace = async (workspaceId: string) => {
    if (!workspaceId || workspaceId === selectedWorkspaceId || pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await selectWorkspace(workspaceId);
      router.refresh();
    } catch {
      setSelectedId(selectedWorkspaceId ?? "");
      setError("워크스페이스를 전환하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  const WorkspaceIcon = selectedWorkspace?.accountType === "Organization" ? Building2 : UserRound;

  return (
    <div className="space-y-1.5">
      <div className="relative flex h-9 items-center gap-2 rounded-md border bg-card px-3">
        <WorkspaceIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <select
          value={selectedId}
          disabled={pending || workspaces.length === 0}
          aria-label="워크스페이스 선택"
          onChange={(event) => void changeWorkspace(event.target.value)}
          className="h-full min-w-0 flex-1 appearance-none bg-transparent pr-4 text-sm outline-none disabled:cursor-wait"
        >
          {workspaces.length === 0 ? <option value="">연결된 워크스페이스 없음</option> : null}
          {workspaces.map((workspace) => (
            <option
              key={workspace.id}
              value={workspace.id}
              disabled={workspace.memberStatus !== "active"}
            >
              {workspace.accountLogin}
              {workspace.memberStatus !== "active" ? " · 정지됨" : ""}
            </option>
          ))}
        </select>
        {pending ? (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className="pointer-events-none size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      {error ? (
        <p className="px-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
