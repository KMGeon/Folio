import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { Github } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RepositorySettingsTable } from "@/components/settings/repository-settings-table";
import { SettingsCard } from "@/components/settings/settings-card";
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

      const page = await RepositoriesPage();

      expect(getWorkspaceContext).toHaveBeenCalledWith("folio_session=abc; workspace=acme");
      expect(findRepositoryTable(page)?.props.disabledReason).toBe(reason);
    },
  );

  it.each(["owner", "admin"] as const)(
    "enables repository controls for an entitled active %s",
    async (role) => {
      arrangePage({ ...baseContext, role });

      const page = await RepositoriesPage();

      expect(fetchRepositories).toHaveBeenCalledWith({
        cookie: "folio_session=abc; workspace=acme",
      });
      expect(findRepositoryTable(page)?.props.disabledReason).toBeNull();
    },
  );

  it("fails closed when workspace context cannot be loaded", async () => {
    arrangePage(null);

    const page = await RepositoriesPage();

    expect(findRepositoryTable(page)?.props.disabledReason).toBe(
      "워크스페이스 권한 정보를 불러올 수 없습니다.",
    );
  });

  it("links to the GitHub App installation and passes access state to the client table", async () => {
    arrangePage(baseContext);

    const page = await RepositoriesPage();

    expect(findAnchor(page, "Manage on GitHub")?.props.href).toBe(
      "https://github.com/settings/installations/145418830",
    );
    expect(findAnchor(page, "Manage on GitHub")?.props.target).toBe("_blank");
    expect(findRepositoryTable(page)?.props.initialRepositories).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "repo-1", githubAccessActive: true })]),
    );
    expect(findSettingsCard(page)?.props.icon).toMatchObject({ type: Github });
  });

  it("guides users to connect the GitHub App when no installation exists", async () => {
    arrangePage(baseContext, null);

    const page = await RepositoriesPage();

    expect(findText(page, "GitHub App 설치를 연결해 주세요.")).toBe(true);
    expect(findAnchor(page, "Manage on GitHub")).toBeNull();
  });
});

function arrangePage(
  context: WorkspaceContext | null,
  githubInstallationId: number | null = 145418830,
) {
  fetchRepositories.mockResolvedValue({
    githubInstallationId,
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
        githubAccessActive: true,
      },
    ],
  });
  getWorkspaceContext.mockResolvedValue(context);
}

function findSettingsCard(
  node: ReactNode,
): ReactElement<{ icon?: ReactElement; children?: ReactNode }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSettingsCard(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  if (node.type === SettingsCard) {
    return node as ReactElement<{ icon?: ReactElement; children?: ReactNode }>;
  }
  return findSettingsCard((node.props as { children?: ReactNode }).children);
}

function findRepositoryTable(node: ReactNode): ReactElement<{
  disabledReason: string | null;
  initialRepositories: { id: string; githubAccessActive: boolean }[];
}> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRepositoryTable(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  if (node.type === RepositorySettingsTable) {
    return node as ReactElement<{
      disabledReason: string | null;
      initialRepositories: { id: string; githubAccessActive: boolean }[];
    }>;
  }
  return findRepositoryTable((node.props as { children?: ReactNode }).children);
}

function findAnchor(
  node: ReactNode,
  text: string,
): ReactElement<{ href: string; target?: string; children?: ReactNode }> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAnchor(child, text);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  const props = node.props as { href?: string; target?: string; children?: ReactNode };
  if (node.type === "a" && findText(props.children, text)) {
    return node as ReactElement<{ href: string; target?: string; children?: ReactNode }>;
  }
  return findAnchor([props.children, (props as { action?: ReactNode }).action], text);
}

function findText(node: ReactNode, text: string): boolean {
  if (typeof node === "string") {
    return node.includes(text);
  }
  if (Array.isArray(node)) {
    return node.some((child) => findText(child, text));
  }
  if (!isValidElement(node)) {
    return false;
  }
  const props = node.props as { action?: ReactNode; children?: ReactNode };
  return findText([props.children, props.action], text);
}
