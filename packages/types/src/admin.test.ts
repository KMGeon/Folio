import { describe, expect, it } from "vitest";
import {
  AdminAuditPageSchema,
  AdminOverviewPayloadSchema,
  AdminUserPageSchema,
  AdminUserStatusFilterSchema,
  AdminWorkspacePageSchema,
} from "./admin.js";

const validAuditItem = {
  id: "00000000-0000-4000-8000-000000000002",
  action: "user_approve",
  actor: {
    id: "00000000-0000-4000-8000-000000000003",
    login: "root",
    avatarUrl: "https://a/root",
  },
  target: {
    type: "user",
    id: "00000000-0000-4000-8000-000000000001",
    label: "octocat",
  },
  workspace: null,
  before: { globalStatus: "pending" },
  after: { globalStatus: "active" },
  createdAt: "2026-07-11T00:00:00.000Z",
} as const;

describe("Admin Phase 1 contracts", () => {
  it("accepts bounded safe user and audit pages", () => {
    expect(
      AdminUserPageSchema.parse({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            login: "octocat",
            avatarUrl: "https://avatars.example/octocat",
            email: null,
            globalStatus: "pending",
            isSystemAdmin: false,
            createdAt: "2026-07-11T00:00:00.000Z",
          },
        ],
        nextCursor: "opaque",
      }).items,
    ).toHaveLength(1);

    expect(
      AdminAuditPageSchema.parse({
        items: [validAuditItem],
        nextCursor: null,
      }).items[0]?.target.label,
    ).toBe("octocat");
  });

  it("rejects review content and invalid overview counts", () => {
    expect(() =>
      AdminAuditPageSchema.parse({
        items: [{ ...validAuditItem, before: { diff: "secret" } }],
        nextCursor: null,
      }),
    ).toThrow();
    expect(() =>
      AdminOverviewPayloadSchema.parse({
        metrics: { pendingUsers: -1, workspaces: 0, enabledRepositories: 0 },
        attention: [],
        recentAudit: [],
      }),
    ).toThrow();
  });

  it("limits audit target types to Phase 1 identities", () => {
    for (const type of ["user", "workspace_member", "repository"] as const) {
      expect(
        AdminAuditPageSchema.parse({
          items: [{ ...validAuditItem, target: { ...validAuditItem.target, type } }],
          nextCursor: null,
        }).items[0]?.target.type,
      ).toBe(type);
    }

    expect(() =>
      AdminAuditPageSchema.parse({
        items: [{ ...validAuditItem, target: { ...validAuditItem.target, type: "pull_request" } }],
        nextCursor: null,
      }),
    ).toThrow();
  });

  it("accepts only the supported user status filters", () => {
    expect(
      ["all", "pending", "active", "suspended"].map((status) =>
        AdminUserStatusFilterSchema.parse(status),
      ),
    ).toEqual(["all", "pending", "active", "suspended"]);
    expect(() => AdminUserStatusFilterSchema.parse("disabled")).toThrow();
  });

  it("rejects empty page cursors", () => {
    expect(() => AdminUserPageSchema.parse({ items: [], nextCursor: "" })).toThrow();
    expect(() => AdminAuditPageSchema.parse({ items: [], nextCursor: "" })).toThrow();
  });

  it("limits recent audit entries to five", () => {
    const overview = {
      metrics: { pendingUsers: 0, workspaces: 0, enabledRepositories: 0 },
      attention: [],
      recentAudit: Array.from({ length: 5 }, () => validAuditItem),
    };

    expect(AdminOverviewPayloadSchema.parse(overview).recentAudit).toHaveLength(5);
    expect(() =>
      AdminOverviewPayloadSchema.parse({
        ...overview,
        recentAudit: [...overview.recentAudit, validAuditItem],
      }),
    ).toThrow();
  });

  it("requires positive attention counts", () => {
    const overview = {
      metrics: { pendingUsers: 1, workspaces: 0, enabledRepositories: 0 },
      attention: [{ kind: "pending_users", count: 1 }],
      recentAudit: [],
    } as const;

    expect(AdminOverviewPayloadSchema.parse(overview).attention[0]?.count).toBe(1);
    expect(() =>
      AdminOverviewPayloadSchema.parse({
        ...overview,
        attention: [{ kind: "pending_users", count: 0 }],
      }),
    ).toThrow();
  });
});

describe("Admin Phase 2 workspace contracts", () => {
  it("allows only metadata-safe workspace fields", () => {
    const page = {
      items: [
        {
          id: "00000000-0000-4000-8000-000000000010",
          accountLogin: "octo-org",
          accountType: "Organization",
          createdAt: "2026-07-12T00:00:00.000Z",
          owner: null,
          memberCount: 2,
          repositoryCount: 3,
          enabledRepositoryCount: 1,
          installationState: "mixed",
          recentActivityAt: null,
        },
      ],
      nextCursor: null,
    };

    expect(AdminWorkspacePageSchema.parse(page).items[0]?.installationState).toBe("mixed");
    expect(() =>
      AdminWorkspacePageSchema.parse({
        ...page,
        items: [{ ...page.items[0], reviewContent: "private diff" }],
      }),
    ).toThrow();
  });
});
