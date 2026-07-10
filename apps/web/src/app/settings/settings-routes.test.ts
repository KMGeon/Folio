import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const settingsRoot = resolve(__dirname);

describe("settings routes", () => {
  it("exposes the supported settings information architecture", () => {
    for (const route of ["preferences", "workspaces", "repositories", "billing"]) {
      expect(existsSync(resolve(settingsRoot, route, "page.tsx"))).toBe(true);
    }

    const shell = readFileSync(
      resolve(settingsRoot, "../../components/settings/settings-shell.tsx"),
      "utf8",
    );
    expect(shell).toContain("Preferences");
    expect(shell).toContain("Workspaces");
    expect(shell).toContain("Repositories");
    expect(shell).toContain("Billing");
    expect(shell).not.toContain("Members");
    expect(shell).not.toContain("Integrations");
    expect(shell).not.toContain("Advanced");
    expect(shell).toContain("lg:grid-cols-[266px_minmax(0,1fr)]");
    expect(shell).not.toContain("GlobalNavigationRail");
  });

  it("does not expose developer diagnostics to customers", () => {
    const routeFiles = [
      "page.tsx",
      "preferences/page.tsx",
      "workspaces/page.tsx",
      "repositories/page.tsx",
      "billing/page.tsx",
    ];
    const source = routeFiles
      .filter((file) => existsSync(resolve(settingsRoot, file)))
      .map((file) => readFileSync(resolve(settingsRoot, file), "utf8"))
      .join("\n");

    expect(source).not.toContain("webEnv");
    expect(source).not.toContain("Backend");
    expect(source).not.toContain("Webhook URL");
    expect(source).not.toContain("Renderer");
    expect(source).not.toContain("PendingUsersAdmin");
  });

  it("opens the Stage Folio GitHub App installation page", () => {
    const workspacesPage = readFileSync(resolve(settingsRoot, "workspaces/page.tsx"), "utf8");

    expect(workspacesPage).toContain(
      '<a href="https://github.com/apps/stage-folio">GitHub App 설치</a>',
    );
  });
});
