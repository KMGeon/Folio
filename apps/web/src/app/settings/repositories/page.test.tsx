import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepositoryToggleForm } from "@/components/repository-toggle-form";
import type * as WorkspacePermissionModule from "@/lib/workspace-permission";

type WorkspaceContext = WorkspacePermissionModule.WorkspaceContext;

const { fetchRepositories, getWorkspaceContext } = vi.hoisted(() => ({
  fetchRepositories: vi.fn(),
  getWorkspaceContext: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [
      { name: "folio_session", value: "abc" },
      { name: "workspace", value: "acme" },
    ],
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/repositories-api", () => ({
  fetchRepositories,
}));

vi.mock("@/lib/workspace-permission", async (importOriginal) => {
  const original = await importOriginal<typeof WorkspacePermissionModule>();
  return { ...original, getWorkspaceContext };
});

import RepositoriesPage from "./page";

Object.assign(globalThis, { React });

const baseContext: WorkspaceContext = {
  workspace: { id: "workspace-1", accountLogin: "acme" },
  role: "owner",
  memberStatus: "active",
  globalStatus: "active",
  isSystemAdmin: false,
  entitlements: ["review_read", "repo_activation"],
};
const restrictedContexts: [WorkspaceContext, string][] = [
  [{ ...baseContext, memberStatus: "suspended" }, "활성 워크스페이스 멤버만 변경할 수 있습니다."],
  [{ ...baseContext, role: "reviewer" }, "워크스페이스 관리자 권한이 필요합니다."],
  [
    { ...baseContext, entitlements: ["review_read"] },
    "현재 이용 범위에 저장소 활성화가 포함되지 않습니다.",
  ],
];

afterEach(() => {
  fetchRepositories.mockReset();
  getWorkspaceContext.mockReset();
});

describe("RepositoriesPage repository activation authorization", () => {
  it.each(restrictedContexts)(
    "disables repository controls for restricted workspace context",
    async (context, reason) => {
      arrangePage(context);

      const page = await RepositoriesPage({ searchParams: Promise.resolve({}) });

      expect(getWorkspaceContext).toHaveBeenCalledWith("folio_session=abc; workspace=acme");
      expect(findToggle(page)?.props.disabledReason).toBe(reason);
    },
  );

  it.each(["owner", "admin"] as const)(
    "enables repository controls for an entitled active %s",
    async (role) => {
      arrangePage({ ...baseContext, role });

      const page = await RepositoriesPage({
        searchParams: Promise.resolve({ repo: "widget", state: "disabled" }),
      });

      expect(fetchRepositories).toHaveBeenCalledWith({
        cookie: "folio_session=abc; workspace=acme",
      });
      expect(findToggle(page)?.props.disabledReason).toBeNull();
    },
  );

  it("fails closed when workspace context cannot be loaded", async () => {
    arrangePage(null);

    const page = await RepositoriesPage({ searchParams: Promise.resolve({}) });

    expect(findToggle(page)?.props.disabledReason).toBe(
      "워크스페이스 권한 정보를 불러올 수 없습니다.",
    );
  });
});

function arrangePage(context: WorkspaceContext | null) {
  fetchRepositories.mockResolvedValue({
    repositories: [
      {
        id: "repo-1",
        installationId: "installation-1",
        githubRepoId: 1,
        owner: "acme",
        name: "widget",
        fullName: "acme/widget",
        private: true,
        defaultBranch: "main",
        folioEnabled: false,
      },
    ],
  });
  getWorkspaceContext.mockResolvedValue(context);
}

function findToggle(node: ReactNode): ReactElement<{ disabledReason: string | null }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findToggle(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  if (node.type === RepositoryToggleForm) {
    return node as ReactElement<{ disabledReason: string | null }>;
  }
  return findToggle((node.props as { children?: ReactNode }).children);
}
