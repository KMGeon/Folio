"use client";

import { BookOpen, ChevronDown, CreditCard, Palette, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

const userItems = [
  { href: "/settings/preferences", label: "Preferences", icon: Palette },
  { href: "/settings/workspaces", label: "Workspaces", icon: Settings2 },
];

const workspaceItems = [
  { href: "/settings/repositories", label: "Repositories", icon: BookOpen },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
];

export function SettingsShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[266px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="border-b px-4 py-5 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5">
        <SettingsNavGroup label="User settings" items={userItems} pathname={pathname} />
        <div className="mt-5">
          <p className="px-2 font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Workspace settings
          </p>
          <div className="mt-2 flex h-9 items-center gap-2 rounded-md border bg-card px-3">
            <img
              src={user.avatarUrl}
              alt=""
              width={18}
              height={18}
              className="size-4.5 rounded-full"
              referrerPolicy="no-referrer"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{user.login}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </div>
          <nav className="mt-2 grid gap-0.5">
            {workspaceItems.map((item) => (
              <SettingsNavItem key={item.href} {...item} active={pathname === item.href} />
            ))}
          </nav>
        </div>
      </aside>
      <main className="min-w-0 overflow-y-auto px-4 py-6 md:px-8 lg:py-8">{children}</main>
    </div>
  );
}

function SettingsNavGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: typeof userItems;
  pathname: string;
}) {
  return (
    <div>
      <p className="px-2 font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <nav className="mt-2 grid gap-0.5">
        {items.map((item) => (
          <SettingsNavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </nav>
    </div>
  );
}

function SettingsNavItem({
  href,
  label,
  icon: Icon,
  active,
}: (typeof userItems)[number] & { active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2.5 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </Link>
  );
}
