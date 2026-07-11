import { describe, expect, it } from "vitest";
import { AdminAuditPageSchema, AdminOverviewPayloadSchema, AdminUserPageSchema } from "./admin.js";

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
        items: [
          {
            id: "00000000-0000-4000-8000-000000000002",
            action: "user_approve",
            actor: {
              id: "00000000-0000-4000-8000-000000000003",
              login: "root",
              avatarUrl: "https://a/root",
            },
            target: { type: "user", id: "00000000-0000-4000-8000-000000000001", label: "octocat" },
            workspace: null,
            before: { globalStatus: "pending" },
            after: { globalStatus: "active" },
            createdAt: "2026-07-11T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      }).items[0]?.target.label,
    ).toBe("octocat");
  });

  it("rejects review content and invalid overview counts", () => {
    expect(() =>
      AdminAuditPageSchema.parse({ items: [{ diff: "secret" }], nextCursor: null }),
    ).toThrow();
    expect(() =>
      AdminOverviewPayloadSchema.parse({
        metrics: { pendingUsers: -1 },
        attention: [],
        recentAudit: [],
      }),
    ).toThrow();
  });
});
