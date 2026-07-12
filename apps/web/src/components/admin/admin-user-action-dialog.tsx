"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

export type AdminUserAction = "approve" | "suspend" | "transfer";

const ACTION_COPY: Record<
  AdminUserAction,
  { title: string; consequence: string; confirmLabel: string }
> = {
  approve: {
    title: "사용자 승인",
    consequence: "승인 대기 상태를 종료하고 Folio 사용을 허용합니다.",
    confirmLabel: "사용자 승인",
  },
  suspend: {
    title: "사용자 정지",
    consequence: "Folio 접근을 정지하며 다시 활성화할 수 없습니다.",
    confirmLabel: "사용자 정지",
  },
  transfer: {
    title: "시스템 관리자 이전",
    consequence: "이전이 완료되면 현재 계정은 /admin 접근 권한을 잃습니다.",
    confirmLabel: "관리자 이전",
  },
};

export function AdminUserActionDialog({
  action,
  targetLogin,
  trigger,
  pending,
  onCancel,
  onConfirm,
}: {
  action: AdminUserAction;
  targetLogin: string;
  trigger: HTMLButtonElement | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const copy = ACTION_COPY[action];

  useEffect(() => {
    const firstControl = dialogRef.current?.querySelector<HTMLButtonElement>("button");
    firstControl?.focus();
    return () => trigger?.focus();
  }, [trigger]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !pending) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const controls = [
      ...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
    ].filter((control) => !control.disabled);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-user-action-title"
        aria-describedby="admin-user-action-description"
        onKeyDown={onKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-lg border bg-popover p-4 shadow-xs"
      >
        <h2 id="admin-user-action-title" className="text-sm font-semibold text-foreground">
          {copy.title}
        </h2>
        <p
          id="admin-user-action-description"
          className="mt-2 text-xs leading-5 text-muted-foreground"
        >
          <span className="font-medium text-foreground">{targetLogin}</span> 계정에 이 작업을
          적용합니다. {copy.consequence}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" size="xs" variant="outline" disabled={pending} onClick={onCancel}>
            취소
          </Button>
          <Button
            type="button"
            size="xs"
            variant={action === "suspend" ? "destructive" : "default"}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? "처리 중" : copy.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
