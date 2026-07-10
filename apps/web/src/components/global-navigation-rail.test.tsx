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

  it("is owned by AppLayout instead of the old header dropdown", () => {
    expect(layoutSource).toContain("<GlobalNavigationRail user={user}");
    expect(layoutSource).not.toContain("<NavMenu");
    expect(layoutSource).not.toContain("<UserMenu");
  });
});
