import { describe, expect, it } from "vitest";
import {
  AdminAuditPageSchema,
  AdminJobPageSchema,
  AdminOverviewPayloadSchema,
  AdminUserPageSchema,
  AdminUserStatusFilterSchema,
  AdminWorkspacePageSchema,
} from "./admin.js";
import { AdminAnalyticsPayloadSchema, AdminAnalyticsRangeSchema } from "./admin-analytics.js";

const emptyQueueSnapshot = {
  pending: 0,
  running: 0,
  retrying: 0,
  succeededLast24h: 0,
  deadLast24h: 0,
} as const;

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
        metrics: {
          pendingUsers: -1,
          workspaces: 0,
          enabledRepositories: 0,
          distressedJobs: 0,
        },
        attention: [],
        queueSnapshot: emptyQueueSnapshot,
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
      metrics: {
        pendingUsers: 0,
        workspaces: 0,
        enabledRepositories: 0,
        distressedJobs: 0,
      },
      attention: [],
      queueSnapshot: emptyQueueSnapshot,
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
      metrics: {
        pendingUsers: 1,
        workspaces: 0,
        enabledRepositories: 0,
        distressedJobs: 0,
      },
      attention: [{ kind: "pending_users", count: 1 }],
      queueSnapshot: emptyQueueSnapshot,
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

describe("Admin Phase 3 job contracts", () => {
  const safeJob = {
    id: "00000000-0000-4000-8000-000000000020",
    kind: "review_pull",
    status: "failed",
    attempts: 2,
    maxAttempts: 5,
    runAfter: "2026-07-12T00:00:00.000Z",
    leaseExpiresAt: null,
    lockedBy: null,
    repository: { id: null, fullName: "acme/app" },
    errorSummary: "timeout",
    isDistressed: true,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T01:00:00.000Z",
  } as const;

  it("accepts safe job pages and rejects payload/result leakage", () => {
    expect(AdminJobPageSchema.parse({ items: [safeJob], nextCursor: null }).items).toHaveLength(1);
    expect(() =>
      AdminJobPageSchema.parse({
        items: [{ ...safeJob, payload: { kind: "review_pull" } }],
        nextCursor: null,
      }),
    ).toThrow();
    expect(() =>
      AdminJobPageSchema.parse({
        items: [{ ...safeJob, result: { chapters: [] } }],
        nextCursor: null,
      }),
    ).toThrow();
    expect(() =>
      AdminJobPageSchema.parse({
        items: [{ ...safeJob, lastError: "raw secret" }],
        nextCursor: null,
      }),
    ).toThrow();
  });

  it("requires Phase 3 overview queue snapshot and distressed metric", () => {
    const overview = {
      metrics: {
        pendingUsers: 0,
        workspaces: 1,
        enabledRepositories: 2,
        distressedJobs: 3,
      },
      attention: [{ kind: "distressed_jobs", count: 3 }],
      queueSnapshot: emptyQueueSnapshot,
      recentAudit: [],
    };
    expect(AdminOverviewPayloadSchema.parse(overview).metrics.distressedJobs).toBe(3);
    expect(() =>
      AdminOverviewPayloadSchema.parse({
        metrics: {
          pendingUsers: 0,
          workspaces: 0,
          enabledRepositories: 0,
        },
        attention: [],
        recentAudit: [],
      }),
    ).toThrow();
  });
});

describe("Admin analytics contracts", () => {
  const analytics = {
    range: "7d",
    days: [
      {
        date: "2026-07-06",
        jobs: { succeeded: 4, failed: 1, dead: 0 },
        users: { created: 2 },
        workspaces: { created: 1, enabledRepositories: 3 },
        audit: { events: 5 },
      },
    ],
    distributions: {
      jobs: [
        { key: "pending", value: 1 },
        { key: "running", value: 2 },
        { key: "succeeded", value: 9 },
        { key: "failed", value: 0 },
        { key: "dead", value: 0 },
      ],
      users: [
        { key: "pending", value: 1 },
        { key: "active", value: 3 },
        { key: "suspended", value: 0 },
      ],
      installations: [
        { key: "active", value: 2 },
        { key: "suspended", value: 0 },
        { key: "none", value: 1 },
        { key: "mixed", value: 0 },
      ],
      audit: [{ key: "user_approve", value: 2 }],
      jobKinds: [{ key: "review_pull", value: 5 }],
    },
  } as const;

  it("accepts daily metadata aggregates and supported ranges", () => {
    expect(AdminAnalyticsRangeSchema.parse("30d")).toBe("30d");
    expect(AdminAnalyticsPayloadSchema.parse(analytics).days[0]?.jobs.succeeded).toBe(4);
  });

  it("rejects unsupported ranges and job-secret fields", () => {
    expect(() => AdminAnalyticsRangeSchema.parse("90d")).toThrow();
    expect(() =>
      AdminAnalyticsPayloadSchema.parse({
        ...analytics,
        days: [{ ...analytics.days[0], jobs: { ...analytics.days[0].jobs, payload: {} } }],
      }),
    ).toThrow();
  });
});
