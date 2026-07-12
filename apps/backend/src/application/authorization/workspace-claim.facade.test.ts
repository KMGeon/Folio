import {
  type InstallationRow,
  type UserRow,
  type WorkspaceMemberRow,
  type WorkspaceRow,
  auditLogsRepo,
  installationsRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import {
  ACCOUNT_TYPE,
  AUDIT_ACTION,
  ENTITLEMENT_FEATURE,
  GLOBAL_STATUS,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  type EntitlementFeature,
  type MembershipStatus,
  type WorkspaceRole,
} from "@folio/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../domain/authorization/entitlement.service.js";
import type { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import type { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { WorkspaceClaimFacade } from "./workspace-claim.facade.js";

const dbDouble = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@folio/db", () => ({
  auditLogsRepo: { record: vi.fn() },
  getDb: () => ({ transaction: dbDouble.transaction }),
  installationsRepo: { upsertByGithubId: vi.fn() },
  usersRepo: { getById: vi.fn(), getByIdForUpdate: vi.fn() },
  workspaceMembersRepo: {
    create: vi.fn(),
    getMembership: vi.fn(),
    getMembershipsForUpdate: vi.fn(),
    listByWorkspace: vi.fn(),
    updateRoleIfCurrent: vi.fn(),
  },
  workspacesRepo: {
    getByGithubAccountIdForUpdate: vi.fn(),
    upsertByGithubAccountId: vi.fn(),
  },
}));

const transaction = { kind: "transaction" };
const now = new Date("2026-07-11T00:00:00.000Z");
const claimInput = {
  userId: "user-1",
  installationId: 123,
};

function workspace(): WorkspaceRow {
  return {
    id: "workspace-1",
    githubAccountId: 42,
    accountLogin: "acme",
    accountType: ACCOUNT_TYPE.ORGANIZATION,
    createdAt: now,
    updatedAt: now,
  };
}

function installation(suspendedAt: Date | null): InstallationRow {
  return {
    id: "installation-1",
    githubInstallationId: 123,
    githubAccountId: 42,
    accountLogin: "acme",
    accountType: ACCOUNT_TYPE.ORGANIZATION,
    suspendedAt,
    createdAt: now,
    updatedAt: now,
  };
}

function member(
  userId: string,
  role: WorkspaceRole = WORKSPACE_ROLE.REVIEWER,
  status: MembershipStatus = MEMBERSHIP_STATUS.ACTIVE,
): WorkspaceMemberRow {
  return {
    id: `membership-${userId}`,
    workspaceId: "workspace-1",
    userId,
    role,
    status,
    elevatedBy: null,
    suspendedBy: null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function user(): UserRow {
  return {
    id: "user-1",
    githubUserId: 1,
    login: "user-login",
    avatarUrl: "https://avatars.example/user-1",
    email: "user@example.com",
    status: "approved",
    globalStatus: GLOBAL_STATUS.ACTIVE,
    isSystemAdmin: false,
    createdAt: now,
    updatedAt: now,
  };
}

describe("WorkspaceClaimFacade", () => {
  let entitlement: { canUseFeature: ReturnType<typeof vi.fn> };
  let membership: { ensureReviewer: ReturnType<typeof vi.fn> };
  let resolver: {
    firstWorkspaceForUser: ReturnType<typeof vi.fn>;
    listInstallationsForWorkspace: ReturnType<typeof vi.fn>;
  };
  let installationIdentity: { resolveInstallationIdentity: ReturnType<typeof vi.fn> };
  let facade: WorkspaceClaimFacade;

  beforeEach(() => {
    vi.resetAllMocks();
    dbDouble.transaction.mockImplementation(async (callback) => callback(transaction));
    vi.mocked(usersRepo.getByIdForUpdate).mockResolvedValue(user());
    entitlement = { canUseFeature: vi.fn() };
    membership = { ensureReviewer: vi.fn() };
    resolver = {
      firstWorkspaceForUser: vi.fn(),
      listInstallationsForWorkspace: vi.fn().mockResolvedValue([]),
    };
    installationIdentity = {
      resolveInstallationIdentity: vi.fn().mockResolvedValue({
        githubAccountId: 42,
        accountLogin: "acme",
        accountType: ACCOUNT_TYPE.ORGANIZATION,
      }),
    };
    facade = new WorkspaceClaimFacade(
      entitlement as unknown as EntitlementService,
      resolver as unknown as WorkspaceResolver,
      membership as unknown as WorkspaceMembershipService,
      installationIdentity as never,
    );
  });

  function arrangeWorkspace(): void {
    vi.mocked(workspacesRepo.upsertByGithubAccountId).mockResolvedValue(workspace());
    vi.mocked(workspacesRepo.getByGithubAccountIdForUpdate).mockResolvedValue(workspace());
  }

  describe("claimAsOwner", () => {
    it("resolves the verified installation id before opening the claim transaction", async () => {
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.create).mockResolvedValue(
        member("user-1", WORKSPACE_ROLE.OWNER),
      );

      await facade.claimAsOwner(claimInput);

      expect(installationIdentity.resolveInstallationIdentity).toHaveBeenCalledWith(123);
      expect(
        installationIdentity.resolveInstallationIdentity.mock.invocationCallOrder[0],
      ).toBeLessThan(dbDouble.transaction.mock.invocationCallOrder[0]!);
      expect(workspacesRepo.upsertByGithubAccountId).toHaveBeenCalledWith(
        {
          githubAccountId: 42,
          accountLogin: "acme",
          accountType: ACCOUNT_TYPE.ORGANIZATION,
        },
        transaction,
      );
      expect(installationsRepo.upsertByGithubId).toHaveBeenCalledWith(
        {
          githubInstallationId: 123,
          githubAccountId: 42,
          accountLogin: "acme",
          accountType: ACCOUNT_TYPE.ORGANIZATION,
        },
        transaction,
      );
    });

    it("locks memberships then rejects a globally suspended claimant before mutation or audit", async () => {
      const order: string[] = [];
      vi.mocked(workspacesRepo.upsertByGithubAccountId).mockResolvedValue(workspace());
      vi.mocked(workspacesRepo.getByGithubAccountIdForUpdate).mockImplementation(async () => {
        order.push("workspace");
        return workspace();
      });
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockImplementation(async () => {
        order.push("memberships");
        return [];
      });
      vi.mocked(usersRepo.getByIdForUpdate).mockImplementation(async () => {
        order.push("user");
        return { ...user(), globalStatus: GLOBAL_STATUS.SUSPENDED };
      });

      const error = await facade.claimAsOwner(claimInput).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CoreException);
      expect((error as CoreException).errorType).toBe(ErrorType.Forbidden);
      expect(order).toEqual(["workspace", "memberships", "user"]);
      expect(workspaceMembersRepo.getMembershipsForUpdate).toHaveBeenCalledWith(
        "workspace-1",
        ["user-1"],
        transaction,
      );
      expect(usersRepo.getByIdForUpdate).toHaveBeenCalledWith("user-1", transaction);
      expect(workspaceMembersRepo.create).not.toHaveBeenCalled();
      expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it("creates and audits the first owner in one transaction", async () => {
      const created = member("user-1", WORKSPACE_ROLE.OWNER);
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.create).mockResolvedValue(created);

      await expect(facade.claimAsOwner(claimInput)).resolves.toBe(created);

      expect(workspacesRepo.upsertByGithubAccountId).toHaveBeenCalledWith(
        expect.objectContaining({ githubAccountId: 42 }),
        transaction,
      );
      expect(workspacesRepo.getByGithubAccountIdForUpdate).toHaveBeenCalledWith(42, transaction);
      expect(
        vi.mocked(workspacesRepo.getByGithubAccountIdForUpdate).mock.invocationCallOrder[0],
      ).toBeLessThan(
        vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mock.invocationCallOrder[0]!,
      );
      expect(workspaceMembersRepo.create).toHaveBeenCalledWith(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          role: WORKSPACE_ROLE.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        transaction,
      );
      expect(auditLogsRepo.record).toHaveBeenCalledWith(
        {
          actorUserId: "user-1",
          action: AUDIT_ACTION.WORKSPACE_CLAIM,
          targetType: "workspace_member",
          targetId: "user-1",
          workspaceId: "workspace-1",
          before: { role: null, status: null },
          after: { role: WORKSPACE_ROLE.OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
        },
        transaction,
      );
    });

    it("promotes and audits an existing active non-owner when no owner exists", async () => {
      const before = member("user-1", WORKSPACE_ROLE.ADMIN);
      const after = member("user-1", WORKSPACE_ROLE.OWNER);
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([before]);
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([before]);
      vi.mocked(workspaceMembersRepo.updateRoleIfCurrent).mockResolvedValue(after);

      await expect(facade.claimAsOwner(claimInput)).resolves.toBe(after);

      expect(workspaceMembersRepo.updateRoleIfCurrent).toHaveBeenCalledWith(
        before.id,
        WORKSPACE_ROLE.ADMIN,
        MEMBERSHIP_STATUS.ACTIVE,
        WORKSPACE_ROLE.OWNER,
        "user-1",
        transaction,
      );
      expect(auditLogsRepo.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTION.WORKSPACE_CLAIM,
          before: { role: WORKSPACE_ROLE.ADMIN, status: MEMBERSHIP_STATUS.ACTIVE },
          after: { role: WORKSPACE_ROLE.OWNER, status: MEMBERSHIP_STATUS.ACTIVE },
        }),
        transaction,
      );
    });

    it("auto-joins a missing caller as reviewer when an owner exists without auditing", async () => {
      const reviewer = member("user-1");
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([
        member("owner-1", WORKSPACE_ROLE.OWNER),
      ]);
      membership.ensureReviewer.mockResolvedValue(reviewer);

      await expect(facade.claimAsOwner(claimInput)).resolves.toBe(reviewer);

      expect(membership.ensureReviewer).toHaveBeenCalledWith("workspace-1", "user-1", transaction);
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it.each([
      [WORKSPACE_ROLE.REVIEWER, MEMBERSHIP_STATUS.ACTIVE],
      [WORKSPACE_ROLE.OWNER, MEMBERSHIP_STATUS.ACTIVE],
      [WORKSPACE_ROLE.REVIEWER, MEMBERSHIP_STATUS.SUSPENDED],
    ] as const)(
      "preserves an existing %s/%s membership when an owner exists",
      async (role, status) => {
        const existing = member("user-1", role, status);
        arrangeWorkspace();
        vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([existing]);
        vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([
          member("owner-1", WORKSPACE_ROLE.OWNER),
          existing,
        ]);

        await expect(facade.claimAsOwner(claimInput)).resolves.toBe(existing);
        expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
        expect(auditLogsRepo.record).not.toHaveBeenCalled();
      },
    );

    it("preserves a suspended membership even when the workspace has no owner", async () => {
      const suspended = member("user-1", WORKSPACE_ROLE.ADMIN, MEMBERSHIP_STATUS.SUSPENDED);
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([suspended]);
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([suspended]);

      await expect(facade.claimAsOwner(claimInput)).resolves.toBe(suspended);
      expect(workspaceMembersRepo.updateRoleIfCurrent).not.toHaveBeenCalled();
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it("rejects a stale promotion and does not emit a false audit", async () => {
      const existing = member("user-1");
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([existing]);
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([existing]);
      vi.mocked(workspaceMembersRepo.updateRoleIfCurrent).mockResolvedValue(null);

      const error = await facade.claimAsOwner(claimInput).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CoreException);
      expect((error as CoreException).errorType).toBe(ErrorType.WorkspaceMembershipConflict);
      expect(auditLogsRepo.record).not.toHaveBeenCalled();
    });

    it("fails when the upserted workspace cannot be locked", async () => {
      vi.mocked(workspacesRepo.upsertByGithubAccountId).mockResolvedValue(workspace());
      vi.mocked(workspacesRepo.getByGithubAccountIdForUpdate).mockResolvedValue(null);

      const error = await facade.claimAsOwner(claimInput).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CoreException);
      expect((error as CoreException).errorType).toBe(ErrorType.WorkspaceNotFound);
      expect(workspaceMembersRepo.listByWorkspace).not.toHaveBeenCalled();
    });

    it("propagates an audit failure from the claim transaction", async () => {
      arrangeWorkspace();
      vi.mocked(workspaceMembersRepo.getMembershipsForUpdate).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.listByWorkspace).mockResolvedValue([]);
      vi.mocked(workspaceMembersRepo.create).mockResolvedValue(
        member("user-1", WORKSPACE_ROLE.OWNER),
      );
      vi.mocked(auditLogsRepo.record).mockRejectedValue(new Error("audit failed"));

      await expect(facade.claimAsOwner(claimInput)).rejects.toThrow("audit failed");
    });
  });

  describe("currentContext", () => {
    it("returns complete user, membership, workspace, and entitled feature state", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user());
      resolver.firstWorkspaceForUser.mockResolvedValue(workspace());
      vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(
        member("user-1", WORKSPACE_ROLE.ADMIN),
      );
      resolver.listInstallationsForWorkspace.mockResolvedValue([installation(null)]);
      entitlement.canUseFeature.mockResolvedValue({ entitled: true });

      await expect(facade.currentContext("user-1")).resolves.toEqual({
        workspace: { id: "workspace-1", accountLogin: "acme" },
        role: WORKSPACE_ROLE.ADMIN,
        memberStatus: MEMBERSHIP_STATUS.ACTIVE,
        globalStatus: GLOBAL_STATUS.ACTIVE,
        isSystemAdmin: false,
        entitlements: Object.values(ENTITLEMENT_FEATURE),
        onboardingState: "ready",
      });
      expect(resolver.listInstallationsForWorkspace).toHaveBeenCalledWith(42);
      expect(entitlement.canUseFeature).toHaveBeenCalledTimes(
        Object.values(ENTITLEMENT_FEATURE).length,
      );
    });

    it("returns null workspace membership state when the user has no membership", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user());
      resolver.firstWorkspaceForUser.mockResolvedValue(null);
      entitlement.canUseFeature.mockResolvedValue({ entitled: true });

      await expect(facade.currentContext("user-1")).resolves.toMatchObject({
        workspace: null,
        role: null,
        memberStatus: null,
        onboardingState: "install_required",
      });
      expect(workspaceMembersRepo.getMembership).not.toHaveBeenCalled();
      expect(resolver.listInstallationsForWorkspace).not.toHaveBeenCalled();
    });

    it("reports membership_suspended before installation availability", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user());
      resolver.firstWorkspaceForUser.mockResolvedValue(workspace());
      vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(
        member("user-1", WORKSPACE_ROLE.REVIEWER, MEMBERSHIP_STATUS.SUSPENDED),
      );
      resolver.listInstallationsForWorkspace.mockResolvedValue([installation(null)]);
      entitlement.canUseFeature.mockResolvedValue({ entitled: true });

      await expect(facade.currentContext("user-1")).resolves.toMatchObject({
        role: WORKSPACE_ROLE.REVIEWER,
        memberStatus: MEMBERSHIP_STATUS.SUSPENDED,
        onboardingState: "membership_suspended",
      });
    });

    it("reports reinstall_required when all workspace installations are suspended", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user());
      resolver.firstWorkspaceForUser.mockResolvedValue(workspace());
      vi.mocked(workspaceMembersRepo.getMembership).mockResolvedValue(member("user-1"));
      resolver.listInstallationsForWorkspace.mockResolvedValue([installation(now)]);
      entitlement.canUseFeature.mockResolvedValue({ entitled: true });

      await expect(facade.currentContext("user-1")).resolves.toMatchObject({
        onboardingState: "reinstall_required",
      });
      expect(resolver.listInstallationsForWorkspace).toHaveBeenCalledWith(42);
    });

    it("omits features denied by the entitlement service", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user());
      resolver.firstWorkspaceForUser.mockResolvedValue(null);
      entitlement.canUseFeature.mockImplementation(
        async ({ feature }: { feature: EntitlementFeature }) =>
          feature === ENTITLEMENT_FEATURE.COMMENT
            ? { entitled: false, reason: "denied" }
            : { entitled: true },
      );

      const result = await facade.currentContext("user-1");

      expect(result.entitlements).not.toContain(ENTITLEMENT_FEATURE.COMMENT);
      expect(result.entitlements).toHaveLength(Object.values(ENTITLEMENT_FEATURE).length - 1);
    });

    it("propagates an entitlement service failure", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(user());
      resolver.firstWorkspaceForUser.mockResolvedValue(null);
      entitlement.canUseFeature.mockRejectedValue(new Error("entitlement unavailable"));

      await expect(facade.currentContext("user-1")).rejects.toThrow("entitlement unavailable");
    });

    it("rejects a missing user before resolving workspace state", async () => {
      vi.mocked(usersRepo.getById).mockResolvedValue(null);

      const error = await facade.currentContext("missing").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CoreException);
      expect((error as CoreException).errorType).toBe(ErrorType.Unauthorized);
      expect(resolver.firstWorkspaceForUser).not.toHaveBeenCalled();
    });
  });
});
