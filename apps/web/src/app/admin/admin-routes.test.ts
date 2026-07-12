import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const adminRoot = resolve(__dirname);

describe("admin routes", () => {
  it("exposes the ready Phase 3 routes including Operations", () => {
    const shell = readFileSync(
      resolve(adminRoot, "../../components/admin/admin-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain('href: "/admin/overview"');
    expect(shell).toContain('href: "/admin/users"');
    expect(shell).toContain('href: "/admin/audit"');
    expect(shell).toContain('href: "/admin/operations"');
    expect(existsSync(resolve(adminRoot, "workspaces", "page.tsx"))).toBe(true);
    expect(existsSync(resolve(adminRoot, "operations", "page.tsx"))).toBe(true);
    expect(existsSync(resolve(adminRoot, "operations", "jobs", "[jobId]", "page.tsx"))).toBe(true);

    expect(readFileSync(resolve(adminRoot, "page.tsx"), "utf8")).toContain(
      'redirect("/admin/overview")',
    );
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
