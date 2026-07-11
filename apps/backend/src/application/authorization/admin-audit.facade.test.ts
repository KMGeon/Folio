import { type AdminAuditRow, adminAuditRepo } from "@folio/db";
import { AUDIT_ACTION, GLOBAL_STATUS, MEMBERSHIP_STATUS, WORKSPACE_ROLE } from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodeAdminPageCursor } from "./admin-page-cursor.js";
import { AdminAuditFacade } from "./admin-audit.facade.js";

vi.mock("@folio/db", () => ({ adminAuditRepo: { list: vi.fn() } }));

const createdAt = new Date("2026-07-11T03:04:05.000Z");
const auditId = "123e4567-e89b-42d3-a456-426614174000";
const actorId = "223e4567-e89b-42d3-a456-426614174000";
const targetId = "323e4567-e89b-42d3-a456-426614174000";
const workspaceId = "423e4567-e89b-42d3-a456-426614174000";

export function auditRow(overrides: Partial<AdminAuditRow> = {}): AdminAuditRow {
  return {
    audit: {
      id: auditId,
      actorUserId: actorId,
      action: AUDIT_ACTION.ROLE_CHANGE,
      targetType: "workspace_member",
      targetId,
      workspaceId,
      before: {
        globalStatus: GLOBAL_STATUS.ACTIVE,
        status: MEMBERSHIP_STATUS.ACTIVE,
        role: WORKSPACE_ROLE.ADMIN,
        owner: actorId,
        systemAdminUserId: actorId,
        folioEnabled: true,
        secret: "must-not-leak",
      },
      after: { role: WORKSPACE_ROLE.REVIEWER, accessToken: "must-not-leak" },
      createdAt,
      updatedAt: new Date("2026-07-11T04:00:00.000Z"),
    },
    actorLogin: "admin",
    actorAvatarUrl: "https://avatars.example/admin",
    targetLabel: "octocat",
    workspaceLogin: "acme",
    ...overrides,
  };
}

describe("AdminAuditFacade", () => {
  const facade = new AdminAuditFacade();

  beforeEach(() => vi.resetAllMocks());

  it("maps query dates and projects only explicitly safe audit fields", async () => {
    vi.mocked(adminAuditRepo.list).mockResolvedValue({ items: [auditRow()], hasMore: false });

    const page = await facade.list({
      limit: 25,
      from: "2026-07-01T00:00:00+09:00",
      to: "2026-07-11T23:59:59Z",
    });

    expect(adminAuditRepo.list).toHaveBeenCalledWith({
      limit: 25,
      q: undefined,
      action: undefined,
      workspaceId: undefined,
      actorUserId: undefined,
      targetId: undefined,
      from: new Date("2026-07-01T00:00:00+09:00"),
      to: new Date("2026-07-11T23:59:59Z"),
      cursor: undefined,
    });
    expect(page).toEqual({
      items: [
        {
          id: auditId,
          action: AUDIT_ACTION.ROLE_CHANGE,
          actor: {
            id: actorId,
            login: "admin",
            avatarUrl: "https://avatars.example/admin",
          },
          target: { type: "workspace_member", id: targetId, label: "octocat" },
          workspace: { id: workspaceId, accountLogin: "acme" },
          before: {
            globalStatus: GLOBAL_STATUS.ACTIVE,
            status: MEMBERSHIP_STATUS.ACTIVE,
            role: WORKSPACE_ROLE.ADMIN,
            owner: actorId,
            systemAdminUserId: actorId,
            folioEnabled: true,
          },
          after: { role: WORKSPACE_ROLE.REVIEWER },
          createdAt: createdAt.toISOString(),
        },
      ],
      nextCursor: null,
    });
    expect(JSON.stringify(page)).not.toContain("must-not-leak");
  });

  it("encodes the last returned row only when the repository reports more", async () => {
    vi.mocked(adminAuditRepo.list).mockResolvedValue({ items: [auditRow()], hasMore: true });

    const page = await facade.list({ limit: 1 });

    expect(decodeAdminPageCursor(page.nextCursor ?? undefined)).toEqual({
      createdAt,
      id: auditId,
    });
  });
});
