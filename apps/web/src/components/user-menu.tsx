"use client";

import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { logoutUrl, type SessionUser } from "@/lib/auth";

/** Top-right avatar button with a click/Escape-dismissed account dropdown. */
export function UserMenu({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signOut = async () => {
    await fetch(logoutUrl(), { method: "POST", credentials: "include" });
    window.location.href = "/login";
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="계정 메뉴"
        className="flex size-8 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {user ? (
          <img
            src={user.avatarUrl}
            alt={user.login}
            width={32}
            height={32}
            referrerPolicy="no-referrer"
            className="size-8 rounded-full border"
          />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full border bg-primary/10 text-sm font-semibold text-primary">
            F
          </span>
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          <div className="border-b px-3 py-2.5">
            <div className="truncate text-sm font-semibold">{user?.login ?? "Folio"}</div>
            {user ? (
              <div className="truncate text-xs text-muted-foreground">@{user.login}</div>
            ) : null}
          </div>
          <div className="p-1">
            <button
              type="button"
              role="menuitem"
              onClick={signOut}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="size-4" />
              로그아웃
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
