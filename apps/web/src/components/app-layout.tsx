import Link from "next/link";
import { cookies } from "next/headers";
import { AppRouteLabel } from "@/components/app-route-label";
import { AppSearch } from "@/components/app-search";
import { GlobalNavigationRail } from "@/components/global-navigation-rail";
import { InstallationOnboardingGate } from "@/components/installation-onboarding-gate";
import type { SessionUser } from "@/lib/auth";
import { getWorkspaceContext } from "@/lib/workspace-permission";

export interface HeaderBreadcrumb {
  org: string;
  repo: string;
  number: number;
}

/**
 * The authenticated app frame: permanent global rail plus route-specific chrome.
 */
export async function AppLayout({
  user,
  breadcrumb,
  children,
}: {
  user: SessionUser | null;
  breadcrumb?: HeaderBreadcrumb;
  children: React.ReactNode;
}) {
  const cookieHeader = user
    ? (await cookies())
        .getAll()
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ")
    : undefined;
  const workspaceContext = user ? await getWorkspaceContext(cookieHeader) : null;

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      <GlobalNavigationRail user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-5">
          <nav className="flex min-w-0 items-center gap-3 text-sm">
            {breadcrumb ? (
              <Link
                href={`/${breadcrumb.org}/${breadcrumb.repo}/pull/${breadcrumb.number}`}
                className="flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="truncate">{breadcrumb.repo}</span>
                <span className="font-mono text-xs text-foreground">#{breadcrumb.number}</span>
              </Link>
            ) : (
              <AppRouteLabel />
            )}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <AppSearch />
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
      <InstallationOnboardingGate onboardingState={workspaceContext?.onboardingState ?? null} />
    </div>
  );
}
