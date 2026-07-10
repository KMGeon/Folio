import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const railSource = readFileSync(resolve(__dirname, "global-navigation-rail.tsx"), "utf8");
const layoutSource = readFileSync(resolve(__dirname, "app-layout.tsx"), "utf8");

describe("global navigation rail", () => {
  it("keeps the icon rail beside a persistent desktop menu", () => {
    expect(railSource).toContain('className="relative z-50 flex h-svh w-12 shrink-0 lg:w-72"');
    expect(railSource).not.toContain("hidden h-svh w-60 flex-col");
    expect(railSource).not.toContain("lg:w-60");
    expect(railSource).not.toContain("lg:hidden");
    expect(railSource).toContain("lg:static");
    expect(railSource).toContain("lg:pointer-events-auto");
    expect(railSource).toContain("lg:translate-x-0");
    expect(railSource).toContain('new CustomEvent("folio:focus-search"');
    expect(railSource).toContain("detail: { trigger: event.currentTarget }");
    expect(railSource).toContain("w-12");
    expect(railSource).toContain("flex h-svh w-12 flex-col");
    expect(railSource).toContain("w-60");
    expect(railSource).toContain('href: "/dashboard"');
    expect(railSource).toContain('href: "/onboarding/install"');
    expect(railSource).toContain('href: "/settings/preferences"');
  });

  it("supports accessible dismissal", () => {
    expect(railSource).toContain('event.key === "Escape"');
    expect(railSource).toContain("contains(event.target as Node)");
    expect(railSource).toContain("setOpen(false)");
    expect(railSource).toContain("aria-expanded={open}");
    expect(railSource).toContain("aria-current");
  });

  it("is owned by AppLayout instead of the old header dropdown", () => {
    expect(layoutSource).toContain("<GlobalNavigationRail user={user}");
    expect(layoutSource).not.toContain("<NavMenu");
    expect(layoutSource).not.toContain("<UserMenu");
  });
});
