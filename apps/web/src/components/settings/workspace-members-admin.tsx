"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  changeMemberRole,
  removeMember,
  restoreMember,
  suspendMember,
  transferOwnership,
  type WorkspaceMember,
} from "@/lib/auth";
import type { WorkspaceContext } from "@/lib/workspace-permission";

type MemberAction = "remove" | "restore" | "role" | "suspend" | "transfer";

type PendingAction = {
  action: MemberAction;
  userId: string;
};

type WorkspaceMembersAdminProps = {
  initialMembers: WorkspaceMember[];
  workspaceContext: WorkspaceContext;
};

const ROLE_LABELS = {
  owner: "소유자",
  admin: "관리자",
  reviewer: "리뷰어",
} as const;

export function WorkspaceMembersAdmin({
  initialMembers,
  workspaceContext,
}: WorkspaceMembersAdminProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const workspaceId = workspaceContext.workspace?.id;
  const canAct =
    workspaceContext.memberStatus === "active" &&
    (workspaceContext.role === "owner" || workspaceContext.role === "admin") &&
    !!workspaceId;

  const runAction = async (
    action: MemberAction,
    member: WorkspaceMember,
    mutation: (workspaceId: string, userId: string) => Promise<unknown>,
  ) => {
    if (!workspaceId) {
      return;
    }
    setError(null);
    setPending((current) => [...current, { action, userId: member.userId }]);
    try {
      await mutation(workspaceId, member.userId);
      router.refresh();
    } catch (caught) {
      // A conflict means the server snapshot won a concurrent authorization change.
      if (shouldRefresh(caught)) {
        setError("멤버 정보가 변경되었습니다. 최신 상태를 불러옵니다.");
        router.refresh();
      } else {
        setError("멤버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setPending((current) =>
        current.filter((item) => item.action !== action || item.userId !== member.userId),
      );
    }
  };

  const confirmAndRun = (
    action: "remove" | "transfer",
    member: WorkspaceMember,
    message: string,
    mutation: (workspaceId: string, userId: string) => Promise<unknown>,
  ) => {
    if (window.confirm(message)) {
      void runAction(action, member, mutation);
    }
  };

  return (
    <div className="space-y-3" aria-busy={pending.length > 0}>
      {workspaceContext.memberStatus === "suspended" ? (
        <p className="rounded-md border border-dashed bg-background/35 px-3 py-2 text-xs text-muted-foreground">
          정지된 멤버십에서는 멤버를 관리할 수 없습니다.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-3xl border-collapse text-left text-xs">
          <caption className="sr-only">워크스페이스 멤버와 관리 작업</caption>
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="h-8 px-3 font-medium">
                멤버
              </th>
              <th scope="col" className="h-8 px-3 font-medium">
                역할
              </th>
              <th scope="col" className="h-8 px-3 font-medium">
                상태
              </th>
              <th scope="col" className="h-8 px-3 text-right font-medium">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {initialMembers.map((member) => (
              <MemberRow
                key={member.userId}
                member={member}
                actorRole={workspaceContext.role}
                canAct={canAct}
                pending={pending}
                onSuspend={() => void runAction("suspend", member, suspendMember)}
                onRestore={() => void runAction("restore", member, restoreMember)}
                onRemove={() =>
                  confirmAndRun(
                    "remove",
                    member,
                    `${member.login} 멤버를 워크스페이스에서 제거하시겠습니까?`,
                    removeMember,
                  )
                }
                onRoleChange={(role) => {
                  if (!workspaceId) {
                    return;
                  }
                  void runAction("role", member, (id, userId) =>
                    changeMemberRole(id, userId, role),
                  );
                }}
                onTransfer={() =>
                  confirmAndRun(
                    "transfer",
                    member,
                    `${member.login} 멤버에게 워크스페이스 소유권을 이전하시겠습니까?`,
                    transferOwnership,
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      <p role="alert" aria-live="polite" className="min-h-4 text-xs text-destructive">
        {error}
      </p>
    </div>
  );
}

type MemberRowProps = {
  member: WorkspaceMember;
  actorRole: WorkspaceContext["role"];
  canAct: boolean;
  pending: PendingAction[];
  onSuspend: () => void;
  onRestore: () => void;
  onRemove: () => void;
  onRoleChange: (role: "admin" | "reviewer") => void;
  onTransfer: () => void;
};

function MemberRow({
  member,
  actorRole,
  canAct,
  pending,
  onSuspend,
  onRestore,
  onRemove,
  onRoleChange,
  onTransfer,
}: MemberRowProps) {
  const isOwner = actorRole === "owner";
  const isManageable = canAct && member.role !== "owner" && (isOwner || member.role === "reviewer");
  const isThisMemberPending = pending.some((item) => item.userId === member.userId);

  return (
    <tr>
      <td className="h-12 px-3">
        <div className="flex items-center gap-2.5">
          <img
            src={member.avatarUrl}
            alt=""
            width={28}
            height={28}
            referrerPolicy="no-referrer"
            className="size-7 shrink-0 rounded-full border"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground/90">{member.login}</div>
            <div className="truncate font-mono text-muted-foreground">
              {member.email ?? "GitHub email 없음"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3">
        {isOwner && member.role !== "owner" && canAct ? (
          <select
            aria-label={`${member.login} 역할`}
            value={member.role}
            disabled={isThisMemberPending}
            onChange={(event) => onRoleChange(event.target.value as "admin" | "reviewer")}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="admin">관리자</option>
            <option value="reviewer">리뷰어</option>
          </select>
        ) : (
          ROLE_LABELS[member.role]
        )}
      </td>
      <td className="px-3">
        <span className={member.status === "suspended" ? "text-destructive" : "text-primary"}>
          {member.status === "suspended" ? "정지됨" : "활성"}
        </span>
      </td>
      <td className="px-3">
        <div className="flex justify-end gap-1.5">
          {isManageable && member.status === "active" ? (
            <>
              <ActionButton
                label="정지"
                member={member}
                action="suspend"
                pending={pending}
                onClick={onSuspend}
              />
              <ActionButton
                label="제거"
                member={member}
                action="remove"
                pending={pending}
                destructive
                onClick={onRemove}
              />
            </>
          ) : null}
          {isManageable && member.status === "suspended" ? (
            <ActionButton
              label="복원"
              member={member}
              action="restore"
              pending={pending}
              onClick={onRestore}
            />
          ) : null}
          {isOwner && isManageable && member.status === "active" ? (
            <ActionButton
              label="소유권 이전"
              member={member}
              action="transfer"
              pending={pending}
              destructive
              onClick={onTransfer}
            />
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function ActionButton({
  label,
  member,
  action,
  pending,
  destructive = false,
  onClick,
}: {
  label: string;
  member: WorkspaceMember;
  action: MemberAction;
  pending: PendingAction[];
  destructive?: boolean;
  onClick: () => void;
}) {
  const isPending = pending.some((item) => item.userId === member.userId && item.action === action);
  const isMemberPending = pending.some((item) => item.userId === member.userId);
  return (
    <Button
      type="button"
      size="xxs"
      variant={destructive ? "destructive" : "outline"}
      aria-label={`${member.login} ${label}`}
      disabled={isMemberPending}
      onClick={onClick}
    >
      {isPending ? "처리 중" : label}
    </Button>
  );
}

function shouldRefresh(error: unknown): boolean {
  return (
    !!error && typeof error === "object" && "shouldRefresh" in error && error.shouldRefresh === true
  );
}
