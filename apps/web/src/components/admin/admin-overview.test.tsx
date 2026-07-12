// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminAuditItem, AdminOverviewPayload } from "@folio/types";

import { AdminOverview } from "./admin-overview";

const mountedRoots: Root[] = [];

Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("AdminOverview", () => {
  it("renders the zero pending-user metric without an attention row", async () => {
    const container = await mount({
      metrics: { pendingUsers: 0, workspaces: 0, enabledRepositories: 0 },
      attention: [],
      recentAudit: [],
    });

    expect(container.textContent).toContain("승인 대기 사용자");
    expect(container.textContent).toContain("0");
    expect(container.querySelector('a[href="/admin/users?status=pending"]')).toBeNull();
    expect(container.textContent).toContain("최근 감사 로그가 없습니다");
  });

  it("links a positive pending-user attention row to the filtered users page", async () => {
    const container = await mount({
      metrics: { pendingUsers: 3, workspaces: 0, enabledRepositories: 0 },
      attention: [{ kind: "pending_users", count: 3 }],
      recentAudit: [],
    });

    const link = container.querySelector('a[href="/admin/users?status=pending"]');
    expect(link?.textContent).toContain("3");
    expect(link?.textContent).toContain("승인 대기");
  });

  it("renders at most five recent audit rows and no future Phase 1 placeholders", async () => {
    const recentAudit = Array.from({ length: 6 }, (_, index) => auditItem(index));
    const container = await mount({
      metrics: { pendingUsers: 0, workspaces: 0, enabledRepositories: 0 },
      attention: [],
      recentAudit,
    });

    expect(container.querySelectorAll("[data-overview-audit-row]")).toHaveLength(5);
    expect(container.textContent).not.toContain("Workspace oversight");
    expect(container.textContent).not.toContain("Jobs");
    expect(container.textContent).not.toContain("Operations");
  });
});

async function mount(payload: AdminOverviewPayload): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<AdminOverview payload={payload} />));
  return container;
}

function auditItem(index: number): AdminAuditItem {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    action: "user_approve",
    actor: {
      id: `10000000-0000-4000-8000-${suffix}`,
      login: `actor-${index}`,
      avatarUrl: `https://example.com/${index}.png`,
    },
    target: { type: "user", id: `20000000-0000-4000-8000-${suffix}`, label: `user-${index}` },
    workspace: null,
    before: { globalStatus: "pending" },
    after: { globalStatus: "active" },
    createdAt: "2026-07-12T03:04:05.000Z",
  };
}
