import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RepositoryToggleForm } from "./repository-toggle-form.js";

globalThis.React = React;

describe("RepositoryToggleForm", () => {
  it("keeps the repository server action available when activation is authorized", () => {
    const markup = renderToStaticMarkup(
      <RepositoryToggleForm
        repositoryId="repo-1"
        repositoryName="acme/widget"
        enabled={false}
        disabledReason={null}
      />,
    );

    expect(markup).toContain('name="repositoryId" value="repo-1"');
    expect(markup).toContain('name="enabled" value="true"');
    expect(markup).toContain('aria-label="Enable acme/widget"');
    expect(markup).not.toContain(' disabled=""');
  });

  it("disables activation and explains the authorization reason", () => {
    const reason = "워크스페이스 관리자 권한이 필요합니다.";
    const markup = renderToStaticMarkup(
      <RepositoryToggleForm
        repositoryId="repo-1"
        repositoryName="acme/widget"
        enabled={false}
        disabledReason={reason}
      />,
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain(reason);
    expect(markup).toContain('aria-describedby="repository-toggle-repo-1-reason"');
  });
});
