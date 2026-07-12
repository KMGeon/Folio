"use client";

import {
  Activity,
  ClipboardList,
  HeartPulse,
  LayoutDashboard,
  Users,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const adminItems = [
  { href: "/admin/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/health", label: "Health", icon: HeartPulse },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: Workflow },
  { href: "/admin/audit", label: "Audit log", icon: ClipboardList },
  { href: "/admin/operations", label: "Operations", icon: Activity },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[266px_minmax(0,1fr)] lg:overflow-hidden">
      <aside className="border-b px-4 py-5 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-5">
        <p className="px-2 font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          System admin
        </p>
        <nav className="mt-2 grid gap-0.5" aria-label="Admin sections">
          {adminItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
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
          })}
        </nav>
      </aside>
      <main className="min-w-0 overflow-y-auto px-4 py-6 md:px-8 lg:py-8">{children}</main>
    </div>
  );
}
