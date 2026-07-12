// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { AdminAuditItem, AdminOverviewPayload } from "@folio/types";

import { AdminOverview } from "./admin-overview";

const mountedRoots: Root[] = [];
const emptyQueue = {
  pending: 0,
  running: 0,
  retrying: 0,
  succeededLast24h: 0,
  deadLast24h: 0,
};

Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("AdminOverview", () => {
  it("renders Phase 3 metrics without attention rows when counts are zero", async () => {
    const container = await mount({
      metrics: {
        pendingUsers: 0,
        workspaces: 0,
        enabledRepositories: 0,
        distressedJobs: 0,
      },
      attention: [],
      queueSnapshot: emptyQueue,
      recentAudit: [],
    });

    expect(container.textContent).toContain("승인 대기 사용자");
    expect(container.textContent).toContain("문제 작업");
    expect(container.textContent).toContain("큐 스냅샷");
    expect(container.querySelector('a[href="/admin/users?status=pending"]')).toBeNull();
    expect(container.querySelector('a[href="/admin/operations?distressed=true"]')).toBeNull();
  });

  it("links distressed jobs attention to the operations filter", async () => {
    const container = await mount({
      metrics: {
        pendingUsers: 0,
        workspaces: 0,
        enabledRepositories: 0,
        distressedJobs: 4,
      },
      attention: [{ kind: "distressed_jobs", count: 4 }],
      queueSnapshot: { ...emptyQueue, deadLast24h: 1 },
      recentAudit: [],
    });

    const link = container.querySelector('a[href="/admin/operations?distressed=true"]');
    expect(link?.textContent).toContain("4");
    expect(link?.textContent).toContain("문제 작업");
    expect(container.textContent).toContain("dead 24h");
  });

  it("renders at most five recent audit rows", async () => {
    const recentAudit = Array.from({ length: 6 }, (_, index) => auditItem(index));
    const container = await mount({
      metrics: {
        pendingUsers: 0,
        workspaces: 0,
        enabledRepositories: 0,
        distressedJobs: 0,
      },
      attention: [],
      queueSnapshot: emptyQueue,
      recentAudit,
    });

    expect(container.querySelectorAll("[data-overview-audit-row]")).toHaveLength(5);
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
