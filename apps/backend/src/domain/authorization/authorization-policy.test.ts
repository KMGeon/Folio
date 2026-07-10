import { GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { describe, expect, it } from "vitest";
import {
  canAccessWorkspace,
  canManageMember,
  canTransferOwnership,
} from "./authorization-policy.js";

const active = MEMBERSHIP_STATUS.ACTIVE;

describe("canAccessWorkspace", () => {
  it("allows an active admin to access an admin-gated action", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.ACTIVE, isSystemAdmin: false },
      { role: WORKSPACE_ROLE.ADMIN, status: active },
      WORKSPACE_ROLE.ADMIN,
    );
    expect(d.allow).toBe(true);
  });

  it("denies a reviewer an admin-gated action", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.ACTIVE, isSystemAdmin: false },
      { role: WORKSPACE_ROLE.REVIEWER, status: active },
      WORKSPACE_ROLE.ADMIN,
    );
    expect(d.allow).toBe(false);
  });

  it("denies a globally suspended user regardless of role", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.SUSPENDED, isSystemAdmin: true },
      { role: WORKSPACE_ROLE.OWNER, status: active },
      WORKSPACE_ROLE.REVIEWER,
    );
    expect(d.allow).toBe(false);
  });

  it("denies a suspended membership (Decision 10)", () => {
    const d = canAccessWorkspace(
      { globalStatus: GLOBAL_STATUS.ACTIVE, isSystemAdmin: false },
      { role: WORKSPACE_ROLE.REVIEWER, status: MEMBERSHIP_STATUS.SUSPENDED },
      WORKSPACE_ROLE.REVIEWER,
    );
    expect(d.allow).toBe(false);
  });
});

describe("canManageMember", () => {
  const admin = { role: WORKSPACE_ROLE.ADMIN, status: active } as const;
  const owner = { role: WORKSPACE_ROLE.OWNER, status: active } as const;
  const reviewer = { role: WORKSPACE_ROLE.REVIEWER, status: active } as const;

  it("lets an admin suspend a reviewer", () => {
    expect(canManageMember(admin, reviewer, "suspend").allow).toBe(true);
  });

  it("forbids an admin acting on another admin (Decision 9)", () => {
    expect(canManageMember(admin, admin, "suspend").allow).toBe(false);
  });

  it("forbids an admin elevating a reviewer (owner-only)", () => {
    expect(canManageMember(admin, reviewer, "elevate").allow).toBe(false);
  });

  it("lets an owner elevate a reviewer", () => {
    expect(canManageMember(owner, reviewer, "elevate").allow).toBe(true);
  });
});

describe("canTransferOwnership", () => {
  it("allows only the owner", () => {
    expect(canTransferOwnership({ role: WORKSPACE_ROLE.OWNER, status: active }).allow).toBe(true);
    expect(canTransferOwnership({ role: WORKSPACE_ROLE.ADMIN, status: active }).allow).toBe(false);
  });
});
