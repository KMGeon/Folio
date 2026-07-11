import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaimWorkspaceButton } from "@/components/claim-workspace-button";

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [] }),
}));

vi.mock("@/lib/auth", () => ({
  getMe: vi.fn(async () => null),
}));

import InstallPage from "./page";

Object.assign(globalThis, { React });

afterEach(() => {
  delete process.env.GITHUB_APP_SLUG;
});

describe("InstallPage", () => {
  it("renders the claim action only for a positive installation id", async () => {
    const page = await InstallPage({
      searchParams: Promise.resolve({ installation_id: "123" }),
    });

    const claim = findElement(page, (element) => element.type === ClaimWorkspaceButton);
    expect(claim?.props).toMatchObject({ installationId: 123 });
  });

  it.each([undefined, "0", "-1", "1.5", "not-a-number"])(
    "renders the configured GitHub installation link for invalid id %s",
    async (installationId) => {
      process.env.GITHUB_APP_SLUG = "folio-dev";
      const page = await InstallPage({
        searchParams: Promise.resolve({ installation_id: installationId }),
      });

      expect(findElement(page, (element) => element.type === ClaimWorkspaceButton)).toBeNull();
      const link = findElement(
        page,
        (element) =>
          element.type === "a" &&
          element.props.href === "https://github.com/apps/folio-dev/installations/new",
      );
      expect(link).not.toBeNull();
    },
  );
});

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, predicate);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return null;
  }
  if (predicate(node)) {
    return node;
  }
  return findElement(node.props.children as ReactNode, predicate);
}
