import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTION,
  AuditActionSchema,
  ENTITLEMENT_FEATURE,
  GLOBAL_STATUS,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  WorkspaceRoleSchema,
} from "./authorization.js";

describe("authorization types", () => {
  it("exposes the fixed workspace roles", () => {
    expect(Object.values(WORKSPACE_ROLE)).toEqual(["owner", "admin", "reviewer"]);
  });

  it("exposes membership and global status values", () => {
    expect(Object.values(MEMBERSHIP_STATUS)).toEqual(["active", "suspended"]);
    expect(Object.values(GLOBAL_STATUS)).toEqual(["pending", "active", "suspended"]);
  });

  it("lists the audited actions and gated features", () => {
    expect(AUDIT_ACTION.OWNER_TRANSFER).toBe("owner_transfer");
    expect(AUDIT_ACTION.SYSTEM_ADMIN_TRANSFER).toBe("system_admin_transfer");
    expect(AUDIT_ACTION.WORKSPACE_CLAIM).toBe("workspace_claim");
    expect(AuditActionSchema.parse("system_admin_transfer")).toBe("system_admin_transfer");
    expect(AuditActionSchema.parse("workspace_claim")).toBe("workspace_claim");
    expect(ENTITLEMENT_FEATURE.PR_ANALYSIS).toBe("pr_analysis");
  });

  it("validates a role via schema and rejects unknown roles", () => {
    expect(WorkspaceRoleSchema.parse("admin")).toBe("admin");
    expect(WorkspaceRoleSchema.safeParse("viewer").success).toBe(false);
  });
});
