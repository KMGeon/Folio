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
 * The single app frame: a top header only (no sidebar). Pages supply `user`, an
 * optional PR `breadcrumb`, and their content. Chrome nav opens from the favicon
 * (NavMenu); account actions live in the top-right avatar menu (UserMenu).
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
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <nav className="flex min-w-0 items-center gap-2.5 text-sm">
          <NavMenu />
          {breadcrumb ? (
            <Link
              href={`/${breadcrumb.org}/${breadcrumb.repo}/pull/${breadcrumb.number}`}
              className="flex min-w-0 items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <span className="truncate text-foreground/80">{breadcrumb.repo}</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-medium">#{breadcrumb.number}</span>
            </Link>
          ) : (
            <span className="font-semibold tracking-tight">대시보드</span>
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
