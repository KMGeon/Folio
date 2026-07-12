import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const adminRoot = resolve(__dirname);

describe("admin routes", () => {
  it("exposes only the Phase 1 information architecture", () => {
    const shell = readFileSync(
      resolve(adminRoot, "../../components/admin/admin-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain('href: "/admin/overview"');
    expect(shell).toContain('href: "/admin/users"');
    expect(shell).toContain('href: "/admin/audit"');
    for (const route of ["workspaces", "operations"]) {
      expect(existsSync(resolve(adminRoot, route, "page.tsx"))).toBe(false);
    }
    expect(shell).not.toContain("/admin/workspaces");
    expect(shell).not.toContain("/admin/operations");

    expect(readFileSync(resolve(adminRoot, "page.tsx"), "utf8")).toContain(
      'redirect("/admin/overview")',
    );
  });

  it("guards the layout with a validated admin return path and system-admin authority", () => {
    const layout = readFileSync(resolve(adminRoot, "layout.tsx"), "utf8");

    expect(layout).toContain('headers()).get("x-folio-request-path")');
    expect(layout).toContain('rawPath?.startsWith("/admin")');
    expect(layout).toContain("const user = await getMe(cookieHeader)");
    expect(layout).toContain("redirect(`/login?redirect=${encodeURIComponent(returnPath)}`)");
    expect(layout).toContain("if (!user.isSystemAdmin)");
    expect(layout).toContain('redirect("/dashboard")');
    expect(layout).toContain("<AdminShell>");
  });

  it("provides compact loading and recoverable error boundaries", () => {
    const loading = readFileSync(resolve(adminRoot, "loading.tsx"), "utf8");
    const error = readFileSync(resolve(adminRoot, "error.tsx"), "utf8");

    expect(loading).toContain("border");
    expect(loading).toContain("animate-pulse");
    expect(error).toContain('"use client"');
    expect(error).toContain("다시 시도");
    expect(error).toContain("reset()");
  });
});
