import Link from "next/link";

import { AppSearch } from "@/components/app-search";
import { NavMenu } from "@/components/nav-menu";
import { UserMenu } from "@/components/user-menu";
import type { SessionUser } from "@/lib/auth";

export interface HeaderBreadcrumb {
  org: string;
  repo: string;
  number: number;
}

/**
 * The single app frame: an editorial masthead (no sidebar). The serif "Folio"
 * wordmark sets the codex identity; the section eyebrow / PR dateline reads like
 * a running head. Chrome nav opens from the F mark (NavMenu); account actions
 * live in the top-right avatar menu (UserMenu).
 */
export function AppLayout({
  user,
  breadcrumb,
  children,
}: {
  user: SessionUser | null;
  breadcrumb?: HeaderBreadcrumb;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-5">
        <nav className="flex min-w-0 items-center gap-3 text-sm">
          <NavMenu />
          <Link
            href="/dashboard"
            className="hidden shrink-0 items-baseline sm:flex"
            aria-label="Folio 홈"
          >
            <span className="font-serif text-base italic leading-none tracking-tight">Folio</span>
          </Link>
          <span aria-hidden className="hidden text-border sm:inline">
            /
          </span>
          {breadcrumb ? (
            <Link
              href={`/${breadcrumb.org}/${breadcrumb.repo}/pull/${breadcrumb.number}`}
              className="flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">{breadcrumb.repo}</span>
              <span className="font-mono text-xs text-foreground">#{breadcrumb.number}</span>
            </Link>
          ) : (
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">
              리뷰 데스크
            </span>
          )}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <AppSearch />
          <UserMenu user={user} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
