"use client";

import type { AdminUserItem, AdminUserPage, AdminUserStatusFilter } from "@folio/types";
import { Ban, Check, ChevronDown, RotateCcw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminUserActionDialog, type AdminUserAction } from "./admin-user-action-dialog";
import { Button } from "@/components/ui/button";
import {
  approveAdminUser,
  fetchAdminUsers,
  isGlobalUserConflict,
  suspendAdminUser,
  transferSystemAdmin,
} from "@/lib/admin-api";

const STATUS_LABELS: Record<AdminUserItem["globalStatus"], string> = {
  active: "활성",
  pending: "승인 대기",
  suspended: "정지됨",
};

const STATUS_STYLES: Record<AdminUserItem["globalStatus"], string> = {
  active: "text-primary",
  pending: "text-muted-foreground",
  suspended: "text-destructive",
};

interface PendingDialog {
  action: AdminUserAction;
  user: AdminUserItem;
  trigger: HTMLButtonElement;
}

export function AdminUsersClient({
  initialPage,
  q,
  status,
}: {
  initialPage: AdminUserPage;
  q?: string;
  status: AdminUserStatusFilter;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialPage.items);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [requestError, setRequestError] = useState<{
    message: string;
    retryPagination: boolean;
  } | null>(null);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const [mutating, setMutating] = useState(false);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setRequestError(null);
    try {
      const page = await fetchAdminUsers({ q, status, limit: 25, cursor: nextCursor });
      // Cursor pages may overlap when records change between requests.
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      setRequestError({ message: errorMessage(error), retryPagination: true });
    } finally {
      setLoadingMore(false);
    }
  };

  const confirmMutation = async () => {
    if (!dialog || mutating) {
      return;
    }
    setMutating(true);
    setRequestError(null);
    try {
      if (dialog.action === "approve") {
        await approveAdminUser(dialog.user.id);
      }
      if (dialog.action === "suspend") {
        await suspendAdminUser(dialog.user.id);
      }
      if (dialog.action === "transfer") {
        await transferSystemAdmin(dialog.user.id);
      }

      setDialog(null);
      if (dialog.action === "transfer") {
        router.push("/dashboard");
      } else {
        router.refresh();
      }
    } catch (error) {
      setRequestError({ message: errorMessage(error), retryPagination: false });
      setDialog(null);
      if (isGlobalUserConflict(error)) {
        router.refresh();
      }
    } finally {
      setMutating(false);
    }
  };

  const openDialog = (
    action: AdminUserAction,
    user: AdminUserItem,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => setDialog({ action, user, trigger: event.currentTarget });

  return (
    <div className="space-y-3">
      <ul
        aria-label="시스템 사용자 목록"
        className="divide-y divide-border rounded-lg border bg-card"
      >
        {items.map((user) => (
          <li key={user.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
            <img
              src={user.avatarUrl}
              alt=""
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              className="size-8 shrink-0 rounded-full border"
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{user.login}</span>
                {user.isSystemAdmin ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    <ShieldCheck className="size-3" aria-hidden="true" />
                    시스템 관리자
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate font-mono">{user.email ?? "GitHub email 없음"}</span>
                <span className={STATUS_STYLES[user.globalStatus]}>
                  {STATUS_LABELS[user.globalStatus]}
                </span>
              </div>
            </div>
            <UserActions user={user} onAction={openDialog} />
          </li>
        ))}
      </ul>

      {requestError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>{requestError.message}</span>
          {requestError.retryPagination && nextCursor ? (
            <Button type="button" size="xxs" variant="outline" onClick={() => void loadMore()}>
              <RotateCcw aria-hidden="true" />
              다시 시도
            </Button>
          ) : null}
        </div>
      ) : null}

      {nextCursor && !requestError ? (
        <div className="flex justify-center">
          <Button
            type="button"
            size="xs"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            <ChevronDown aria-hidden="true" />
            {loadingMore ? "불러오는 중" : "더 보기"}
          </Button>
        </div>
      ) : null}

      {dialog ? (
        <AdminUserActionDialog
          action={dialog.action}
          targetLogin={dialog.user.login}
          trigger={dialog.trigger}
          pending={mutating}
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmMutation()}
        />
      ) : null}
    </div>
  );
}

function UserActions({
  user,
  onAction,
}: {
  user: AdminUserItem;
  onAction: (
    action: AdminUserAction,
    user: AdminUserItem,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
}) {
  if (user.isSystemAdmin || user.globalStatus === "suspended") {
    return null;
  }

  if (user.globalStatus === "pending") {
    return (
      <Button type="button" size="xs" onClick={(event) => onAction("approve", user, event)}>
        <Check aria-hidden="true" />
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
        onClick={(event) => onAction("suspend", user, event)}
      >
        <Ban aria-hidden="true" />
        정지
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={(event) => onAction("transfer", user, event)}
      >
        <ShieldCheck aria-hidden="true" />
        관리자 이전
      </Button>
    </div>
  );
}

function errorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
  return `요청을 처리하지 못했습니다. ${detail}`;
}
