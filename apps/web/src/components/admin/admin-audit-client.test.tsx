// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminAuditItem, AdminAuditPage } from "@folio/types";

const mocks = vi.hoisted(() => ({ fetchAudit: vi.fn() }));

vi.mock("@/lib/admin-api", () => ({ fetchAdminAudit: mocks.fetchAudit }));

import { AdminAuditClient } from "./admin-audit-client";

const mountedRoots: Root[] = [];
const first = auditItem("first", "user_approve");

Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => mocks.fetchAudit.mockReset());

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("AdminAuditClient", () => {
  it("renders audit identities, scope, action, date, and safely expanded JSON snapshots", async () => {
    const malicious = {
      ...first,
      before: { owner: '<img src=x onerror="window.hacked=true">' },
      after: { globalStatus: "active" as const },
    };
    const container = await mount({ items: [malicious], nextCursor: null });

    expect(container.textContent).toContain("actor-first");
    expect(container.textContent).toContain("user_approve");
    expect(container.textContent).toContain("target-first");
    expect(container.textContent).toContain("workspace-first");
    expect(container.querySelector("time")?.getAttribute("datetime")).toBe(first.createdAt);

    await click(button(container, "세부 정보"));
    const snapshots = [...container.querySelectorAll("pre")];
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.textContent).toBe(JSON.stringify(malicious.before, null, 2));
    expect(snapshots[1]?.textContent).toBe(JSON.stringify(malicious.after, null, 2));
    expect(container.querySelector("img")).toBeNull();
  });

  it("constructs GET filters for every supported audit query", async () => {
    const container = await mount(
      { items: [first], nextCursor: null },
      {
        q: "role change",
        action: "role_change",
        workspaceId: "workspace-1",
        actorUserId: "actor-1",
        targetId: "target-1",
        from: "2026-07-01",
        to: "2026-07-12",
      },
    );
    const form = container.querySelector("form");

    expect(form).not.toBeNull();
    expect(form?.getAttribute("method")?.toLowerCase()).toBe("get");
    expect(form?.getAttribute("action")).toBe("/admin/audit");
    for (const [name, value] of Object.entries({
      q: "role change",
      action: "role_change",
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetId: "target-1",
      from: "2026-07-01",
      to: "2026-07-12",
    })) {
      const control = (form as HTMLFormElement).elements.namedItem(name) as
        | HTMLInputElement
        | HTMLSelectElement;
      expect(control.value).toBe(value);
    }
  });

  it("uses validated date boundaries for pagination while preserving date-only form values", async () => {
    const formFilters = {
      q: "role change",
      action: "role_change" as const,
      workspaceId: "workspace-1",
      actorUserId: "actor-1",
      targetId: "target-1",
      from: "2026-07-01",
      to: "2026-07-12",
    };
    const requestFilters = {
      ...formFilters,
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-12T23:59:59.999Z",
    };
    mocks.fetchAudit.mockResolvedValueOnce({
      items: [auditItem("second", "member_suspend")],
      nextCursor: null,
    });
    const container = await mount(
      { items: [first], nextCursor: "cursor-1" },
      formFilters,
      requestFilters,
    );

    await click(button(container, "더 보기"));

    expect(mocks.fetchAudit).toHaveBeenCalledWith({
      ...requestFilters,
      cursor: "cursor-1",
      limit: 25,
    });
    expect((container.querySelector('input[name="from"]') as HTMLInputElement | null)?.value).toBe(
      "2026-07-01",
    );
    expect((container.querySelector('input[name="to"]') as HTMLInputElement | null)?.value).toBe(
      "2026-07-12",
    );
    expect(container.querySelectorAll("[data-audit-row]")).toHaveLength(2);
  });

  it("retains rows on pagination failure, retries, and de-duplicates overlapping IDs", async () => {
    const formFilters = { from: "2026-07-01", to: "2026-07-12" };
    const requestFilters = {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-07-12T23:59:59.999Z",
    };
    mocks.fetchAudit.mockRejectedValueOnce(new Error("page unavailable")).mockResolvedValueOnce({
      items: [first, auditItem("second", "member_suspend")],
      nextCursor: null,
    });
    const container = await mount(
      { items: [first], nextCursor: "cursor-1" },
      formFilters,
      requestFilters,
    );

    await click(button(container, "더 보기"));
    expect(container.textContent).toContain("target-first");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("page unavailable");

    await click(button(container, "다시 시도"));
    expect(mocks.fetchAudit).toHaveBeenCalledTimes(2);
    const expectedRequest = { ...requestFilters, cursor: "cursor-1", limit: 25 };
    expect(mocks.fetchAudit).toHaveBeenNthCalledWith(1, expectedRequest);
    expect(mocks.fetchAudit).toHaveBeenNthCalledWith(2, expectedRequest);
    expect(container.querySelectorAll("[data-audit-row]")).toHaveLength(2);
    expect(container.textContent).toContain("target-second");
  });

  it("renders a clear empty state", async () => {
    const container = await mount({ items: [], nextCursor: null });

    expect(container.textContent).toContain("감사 로그가 없습니다");
    expect(container.querySelectorAll("[data-audit-row]")).toHaveLength(0);
  });
});

async function mount(
  initialPage: AdminAuditPage,
  formFilters: React.ComponentProps<typeof AdminAuditClient>["formFilters"] = {},
  requestFilters: React.ComponentProps<typeof AdminAuditClient>["requestFilters"] = formFilters,
): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () =>
    root.render(
      <AdminAuditClient
        initialPage={initialPage}
        formFilters={formFilters}
        requestFilters={requestFilters}
      />,
    ),
  );
  return container;
}

async function click(target: HTMLButtonElement): Promise<void> {
  await act(async () => target.click());
}

function button(container: ParentNode, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!match) {
    throw new Error(`Missing button: ${label}`);
  }
  return match;
}

function auditItem(suffix: string, action: AdminAuditItem["action"]): AdminAuditItem {
  return {
    id: `00000000-0000-4000-8000-${suffix.padEnd(12, "0").slice(0, 12)}`,
    action,
    actor: {
      id: `10000000-0000-4000-8000-${suffix.padEnd(12, "0").slice(0, 12)}`,
      login: `actor-${suffix}`,
      avatarUrl: `https://example.com/actor-${suffix}.png`,
    },
    target: {
      type: "user",
      id: `20000000-0000-4000-8000-${suffix.padEnd(12, "0").slice(0, 12)}`,
      label: `target-${suffix}`,
    },
    workspace: {
      id: `30000000-0000-4000-8000-${suffix.padEnd(12, "0").slice(0, 12)}`,
      accountLogin: `workspace-${suffix}`,
    },
    before: { globalStatus: "pending" },
    after: { globalStatus: "active" },
    createdAt: "2026-07-12T03:04:05.000Z",
  };
}
