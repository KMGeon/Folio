import React, { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AdminAuditClient,
  type AdminAuditFormFilters,
  type AdminAuditRequestFilters,
} from "@/components/admin/admin-audit-client";

const { fetchAdminAudit } = vi.hoisted(() => ({ fetchAdminAudit: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [{ name: "folio_session", value: "abc" }],
  }),
}));

vi.mock("@/lib/admin-api", () => ({ fetchAdminAudit }));

import AdminAuditPage from "./page";

Object.assign(globalThis, { React });

afterEach(() => {
  fetchAdminAudit.mockReset();
});

describe("AdminAuditPage date filters", () => {
  it("normalizes date-only filters at the API boundary while preserving form values", async () => {
    fetchAdminAudit.mockResolvedValue({ items: [], nextCursor: null });

    const page = await AdminAuditPage({
      searchParams: Promise.resolve({
        q: " role change ",
        action: "role_change",
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        targetId: "target-1",
        from: "2026-07-01",
        to: "2026-07-12",
      }),
    });

    expect(fetchAdminAudit).toHaveBeenCalledWith({
      q: "role change",
      action: "role_change",
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetId: "target-1",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-12T23:59:59.999Z",
      limit: 25,
      cookie: "folio_session=abc",
    });
    expect(findAuditClient(page)?.props.formFilters).toEqual({
      q: "role change",
      action: "role_change",
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetId: "target-1",
      from: "2026-07-01",
      to: "2026-07-12",
    });
    expect(findAuditClient(page)?.props.requestFilters).toEqual({
      q: "role change",
      action: "role_change",
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetId: "target-1",
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-12T23:59:59.999Z",
    });
  });

  it.each([
    [undefined, undefined],
    ["", "   "],
    ["2026-02-30", "2026-13-01"],
    ["2026-07-01T00:00:00Z", "not-a-date"],
  ])("omits absent or invalid date filters safely", async (from, to) => {
    fetchAdminAudit.mockResolvedValue({ items: [], nextCursor: null });

    await AdminAuditPage({
      searchParams: Promise.resolve({ q: "audit", action: "user_approve", from, to }),
    });

    expect(fetchAdminAudit).toHaveBeenCalledWith({
      q: "audit",
      action: "user_approve",
      workspaceId: undefined,
      actorUserId: undefined,
      targetId: undefined,
      from: undefined,
      to: undefined,
      limit: 25,
      cookie: "folio_session=abc",
    });
  });
});

function findAuditClient(node: ReactNode): ReactElement<{
  formFilters: AdminAuditFormFilters;
  requestFilters: AdminAuditRequestFilters;
}> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findAuditClient(child);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!isValidElement(node)) {
    return null;
  }
  if (node.type === AdminAuditClient) {
    return node as ReactElement<{
      formFilters: AdminAuditFormFilters;
      requestFilters: AdminAuditRequestFilters;
    }>;
  }
  return findAuditClient((node.props as { children?: ReactNode }).children);
}
