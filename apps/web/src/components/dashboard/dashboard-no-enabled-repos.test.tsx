import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardNoEnabledRepos } from "./dashboard-no-enabled-repos";

Object.assign(globalThis, { React });

describe("DashboardNoEnabledRepos", () => {
  it("explains Settings toggle and links to repository settings", () => {
    const html = renderToStaticMarkup(<DashboardNoEnabledRepos />);

    expect(html).toContain('aria-label="No enabled repositories"');
    expect(html).toContain("활성화된 레포가 없습니다");
    expect(html).toContain("Settings");
    expect(html).toContain("/settings/repositories");
    expect(html).toContain("Repository settings 열기");
  });
});
