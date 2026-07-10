import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const railSource = readFileSync(resolve(__dirname, "global-navigation-rail.tsx"), "utf8");
const layoutSource = readFileSync(resolve(__dirname, "app-layout.tsx"), "utf8");

describe("global navigation rail", () => {
  it("keeps a compact rail with a route-aware account menu", () => {
    expect(railSource).toContain('className="relative z-50 h-svh w-12 shrink-0"');
    expect(railSource).not.toContain('id="global-navigation-drawer"');
    expect(railSource).not.toContain("w-60");
    expect(railSource).not.toContain("Folio</span>");
    expect(railSource).not.toContain('href: "/onboarding/install"');
    expect(railSource).toContain('aria-haspopup="menu"');
    expect(railSource).toContain('role="menu"');
    expect(railSource).toContain('pathname.startsWith("/settings")');
    expect(railSource).toContain('aria-label="앱으로 돌아가기"');
    expect(railSource).toContain('href: "/dashboard"');
    expect(railSource).toContain('href: "/settings/preferences"');
    expect(railSource).toContain('new CustomEvent("folio:focus-search"');
    expect(railSource).toContain("detail: { trigger: event.currentTarget }");
  });

  it("supports accessible dismissal", () => {
    expect(railSource).toContain('event.key === "Escape"');
    expect(railSource).toContain("contains(event.target as Node)");
    expect(railSource).toContain("setAccountOpen(false)");
    expect(railSource).toContain("aria-expanded={accountOpen}");
    expect(railSource).toContain("aria-current");
  });

  it("moves focus through the scoped account menu and restores its trigger", () => {
    expect(railSource).toContain("const accountTriggerRef = useRef<HTMLButtonElement>(null)");
    expect(railSource).toContain("const firstMenuItemRef = useRef<HTMLButtonElement>(null)");
    expect(railSource).toContain("firstMenuItemRef.current?.focus()");
    expect(railSource).toContain("accountTriggerRef.current?.focus()");
    expect(railSource).toContain('case "ArrowDown":');
    expect(railSource).toContain('case "ArrowUp":');
    expect(railSource).toContain('case "Home":');
    expect(railSource).toContain('case "End":');
    expect(railSource).toContain("onKeyDown={onAccountMenuKeyDown}");
    expect(railSource).toContain('className="p-1" role="menu"');
    expect(railSource.indexOf('role="menu"')).toBeGreaterThan(railSource.indexOf("Workspaces"));
  });

  it("is owned by AppLayout instead of the old header dropdown", () => {
    expect(layoutSource).toContain("<GlobalNavigationRail user={user}");
    expect(layoutSource).not.toContain("<NavMenu");
    expect(layoutSource).not.toContain("<UserMenu");
  });
});
