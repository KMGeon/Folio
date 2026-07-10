"use client";

import { ArrowLeft, LayoutDashboard, LogOut, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { logoutUrl, type SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/settings/preferences", label: "설정", icon: Settings },
];

const railControlClassName =
  "flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function GlobalNavigationRail({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const settingsRoute = pathname.startsWith("/settings");
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);

  useEffect(() => setAccountOpen(false), [pathname]);

  useEffect(() => {
    if (!accountOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  async function signOut() {
    await fetch(logoutUrl(), { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  return (
    <aside ref={menuRef} className="relative z-50 h-svh w-12 shrink-0">
      <div className="flex h-full w-full flex-col items-center border-r bg-card/70 py-2">
        {settingsRoute ? (
          <Link
            href="/dashboard"
            aria-label="앱으로 돌아가기"
            title="앱으로 돌아가기"
            className={railControlClassName}
          >
            <ArrowLeft className="size-4" />
          </Link>
        ) : (
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-label="계정 메뉴"
            onClick={() => setAccountOpen((value) => !value)}
            className={railControlClassName}
          >
            {user ? (
              <img
                src={user.avatarUrl}
                alt=""
                width={24}
                height={24}
                referrerPolicy="no-referrer"
                className="size-6 rounded-md"
              />
            ) : (
              <BrandMark className="size-7" imageClassName="size-5" />
            )}
          </button>
        )}
        <nav className="mt-4 grid gap-1">
          {NAV_ITEMS.map((item) => (
            <RailLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="my-2 h-px w-7 bg-border" />
        <button
          type="button"
          aria-label="검색"
          title="검색"
          onClick={(event) =>
            window.dispatchEvent(
              new CustomEvent("folio:focus-search", {
                detail: { trigger: event.currentTarget },
              }),
            )
          }
          className={railControlClassName}
        >
          <Search className="size-4" />
        </button>
      </div>

      {accountOpen && !settingsRoute ? (
        <div
          role="menu"
          className="absolute top-2 left-12 w-56 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          <div className="border-b px-3 py-3">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
              Workspaces
            </p>
            <div className="mt-2 flex items-center gap-2">
              {user ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  referrerPolicy="no-referrer"
                  className="size-7 rounded-md"
                />
              ) : (
                <BrandMark className="size-7" imageClassName="size-5" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {user?.login ?? "Folio"}
                </p>
                {user ? (
                  <p className="truncate font-mono text-xs text-muted-foreground">@{user.login}</p>
                ) : null}
              </div>
            </div>
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
    </aside>
  );
}

function RailLink({
  item: { href, label, icon: Icon },
  pathname,
}: {
  item: (typeof NAV_ITEMS)[number];
  pathname: string;
}) {
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex size-8 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="size-4" />
    </Link>
  );
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/settings/preferences") {
    return pathname.startsWith("/settings");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
