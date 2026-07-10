"use client";

import { usePathname } from "next/navigation";

export function AppRouteLabel() {
  const pathname = usePathname();
  if (pathname.startsWith("/settings")) {
    const section = pathname.split("/")[2] ?? "preferences";
    return (
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <span className="text-muted-foreground">Settings</span>
        <span className="text-border">/</span>
        <span className="truncate font-medium capitalize text-foreground">{section}</span>
      </span>
    );
  }
  const label = pathname.startsWith("/onboarding")
    ? "Install"
    : pathname === "/dashboard"
      ? "Dashboard"
      : "Review";
  return <span className="truncate text-sm font-medium text-foreground/90">{label}</span>;
}
