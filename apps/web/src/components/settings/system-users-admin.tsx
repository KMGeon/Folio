"use client";

import { Ban, Check, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type GlobalUser,
  approveGlobalUser,
  suspendGlobalUser,
  transferSystemAdmin,
} from "@/lib/auth";

const STATUS_LABELS: Record<GlobalUser["globalStatus"], string> = {
  active: "활성",
  pending: "승인 대기",
  suspended: "정지됨",
};

const STATUS_STYLES: Record<GlobalUser["globalStatus"], string> = {
  active: "text-primary",
  pending: "text-muted-foreground",
  suspended: "text-destructive",
};

type UserAction = "approve" | "suspend" | "transfer";

export function SystemUsersAdmin({ initialUsers }: { initialUsers: GlobalUser[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [pendingActions, setPendingActions] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const run = async (
    user: GlobalUser,
    action: UserAction,
    mutation: () => Promise<unknown>,
    nextStatus?: GlobalUser["globalStatus"],
  ) => {
    const actionKey = `${user.id}:${action}`;
    setPendingActions((current) => new Set(current).add(actionKey));
    setError(null);

    try {
      await mutation();
      if (nextStatus) {
        setUsers((current) =>
          current.map((item) =>
            item.id === user.id ? { ...item, globalStatus: nextStatus } : item,
          ),
        );
      }
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
      // A conflict means this client rendered an obsolete authorization snapshot.
      if (shouldRefresh(caught)) {
        router.refresh();
      }
    } finally {
      setPendingActions((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const transfer = (user: GlobalUser) => {
    const confirmed = window.confirm(
      `${user.login} 님에게 시스템 관리자 권한을 이전하시겠습니까? 이전 후에는 이 작업을 되돌릴 수 없습니다.`,
    );
    if (!confirmed) {
      return;
    }
    void run(user, "transfer", () => transferSystemAdmin(user.id));
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border" aria-label="전역 사용자 목록">
        {users.map((user) => (
          <li key={user.id} className="flex items-center gap-3 py-2.5">
            <img
              src={user.avatarUrl}
              alt={`${user.login} 프로필`}
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              className="size-8 shrink-0 rounded-full border"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground/90">
                  {user.login}
                </span>
                {user.isSystemAdmin ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    시스템 관리자
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-mono">{user.email ?? "GitHub email 없음"}</span>
                <span
                  className={STATUS_STYLES[user.globalStatus]}
                  aria-label={`상태: ${STATUS_LABELS[user.globalStatus]}`}
                >
                  {STATUS_LABELS[user.globalStatus]}
                </span>
              </div>
            </div>
            <UserActions
              user={user}
              pendingActions={pendingActions}
              onApprove={() =>
                void run(user, "approve", () => approveGlobalUser(user.id), "active")
              }
              onSuspend={() =>
                void run(user, "suspend", () => suspendGlobalUser(user.id), "suspended")
              }
              onTransfer={() => transfer(user)}
            />
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function UserActions({
  user,
  pendingActions,
  onApprove,
  onSuspend,
  onTransfer,
}: {
  user: GlobalUser;
  pendingActions: Set<string>;
  onApprove: () => void;
  onSuspend: () => void;
  onTransfer: () => void;
}) {
  if (user.isSystemAdmin || user.globalStatus === "suspended") {
    return null;
  }

  if (user.globalStatus === "pending") {
    return (
      <Button
        type="button"
        size="xs"
        aria-label={`${user.login} 승인`}
        disabled={pendingActions.has(`${user.id}:approve`)}
        onClick={onApprove}
      >
        <Check className="size-4" aria-hidden="true" />
        승인
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-label={`${user.login} 정지`}
        disabled={pendingActions.has(`${user.id}:suspend`)}
        onClick={onSuspend}
      >
        <Ban className="size-4" aria-hidden="true" />
        정지
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-label={`${user.login} 시스템 관리자 이전`}
        disabled={pendingActions.has(`${user.id}:transfer`)}
        onClick={onTransfer}
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        관리자 이전
      </Button>
    </div>
  );
}

function errorMessage(caught: unknown): string {
  const detail = caught instanceof Error ? caught.message : "잠시 후 다시 시도해 주세요.";
  return `요청을 처리하지 못했습니다. ${detail}`;
}

function shouldRefresh(caught: unknown): boolean {
  return (
    typeof caught === "object" &&
    caught !== null &&
    "shouldRefresh" in caught &&
    caught.shouldRefresh === true
  );
}
