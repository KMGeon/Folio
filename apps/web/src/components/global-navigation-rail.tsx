"use client";

import { LayoutDashboard, LogOut, PlugZap, Search, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/brand-mark";
import { logoutUrl, type SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/onboarding/install", label: "설치", icon: PlugZap },
  { href: "/settings/preferences", label: "설정", icon: Settings },
];

export function GlobalNavigationRail({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const disclosureRef = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (disclosureRef.current && !disclosureRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    await fetch(logoutUrl(), { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  return (
    <div ref={disclosureRef} className="relative z-50 w-12 shrink-0">
      <aside className="absolute inset-y-0 left-0 flex w-12 flex-col items-center border-r bg-card/70 py-2">
        <button
          type="button"
          aria-controls="global-navigation-drawer"
          aria-expanded={open}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setOpen((current) => !current)}
          className="flex size-8 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

        <nav className="mt-4 grid gap-1">
          {NAV_ITEMS.filter((item) => item.href !== "/onboarding/install").map((item) => (
            <RailLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="my-2 h-px w-7 bg-border" />
        <button
          type="button"
          aria-label="검색"
          title="검색"
          onClick={() => window.dispatchEvent(new Event("folio:focus-search"))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Search className="size-4" />
        </button>
      </aside>

      <div
        id="global-navigation-drawer"
        className={cn(
          "absolute inset-y-0 left-12 flex h-svh w-60 max-w-[calc(100vw-3rem)] flex-col border-r bg-popover shadow-lg transition-transform duration-150 motion-reduce:transition-none",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full",
        )}
      >
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <BrandMark className="size-7" imageClassName="size-5" />
          <span className="font-serif text-base italic">Folio</span>
        </div>
        <nav className="grid gap-1 p-2">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActivePath(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t p-2">
          <div className="flex items-center gap-2 px-2 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {user?.login ?? "Folio"}
            </span>
            <button
              type="button"
              onClick={signOut}
              aria-label="로그아웃"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
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
