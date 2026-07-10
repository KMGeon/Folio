import { describe, expect, it } from "vitest";
import {
  type WorkspaceContext,
  canManageMembers,
  canManageRoles,
  canSeeSystemUsers,
  hasEntitlement,
} from "./workspace-permission";

const base: WorkspaceContext = {
  workspace: { id: "ws1", accountLogin: "acme" },
  role: "reviewer",
  memberStatus: "active",
  globalStatus: "active",
  isSystemAdmin: false,
  entitlements: ["review_read"],
};

describe("workspace permission helpers", () => {
  it("only owner/admin manage members", () => {
    expect(canManageMembers({ ...base, role: "admin" })).toBe(true);
    expect(canManageMembers({ ...base, role: "owner" })).toBe(true);
    expect(canManageMembers(base)).toBe(false);
  });

  it("only owner manages roles", () => {
    expect(canManageRoles({ ...base, role: "owner" })).toBe(true);
    expect(canManageRoles({ ...base, role: "admin" })).toBe(false);
  });

  it("only system admin sees system users", () => {
    expect(canSeeSystemUsers({ ...base, isSystemAdmin: true })).toBe(true);
    expect(canSeeSystemUsers(base)).toBe(false);
  });

  it("checks entitlement membership", () => {
    expect(hasEntitlement(base, "review_read")).toBe(true);
    expect(hasEntitlement(base, "pr_analysis")).toBe(false);
  });
});
