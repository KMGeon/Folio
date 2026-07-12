import {
  type WorkspaceMemberRow,
  auditLogsRepo,
  getDb,
  installationsRepo,
  repositoriesRepo,
  usersRepo,
  workspaceMembersRepo,
  workspacesRepo,
} from "@folio/db";
import {
  AUDIT_ACTION,
  ENTITLEMENT_FEATURE,
  GLOBAL_STATUS,
  INSTALLATION_ONBOARDING_STATE,
  MEMBERSHIP_STATUS,
  WORKSPACE_ROLE,
  type AccountType,
  type EntitlementFeature,
} from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import { GitHubInstallationIdentityPort } from "../../domain/auth/github-installation-identity.port.js";
import { EntitlementService } from "../../domain/authorization/entitlement.service.js";
import { WorkspaceMembershipService } from "../../infrastructure/authorization/workspace-membership.service.js";
import { WorkspaceResolver } from "../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

export interface ClaimInput {
  userId: string;
  installationId: number;
}

interface ResolvedClaimInput {
  userId: string;
  installationId: number;
  githubAccountId: number;
  accountLogin: string;
  accountType: AccountType;
}

@Injectable()
export class WorkspaceClaimFacade {
  constructor(
    @Inject(EntitlementService) private readonly entitlements: EntitlementService,
    @Inject(WorkspaceResolver) private readonly resolver: WorkspaceResolver,
    @Inject(WorkspaceMembershipService)
    private readonly membership: WorkspaceMembershipService,
    @Inject(GitHubInstallationIdentityPort)
    private readonly installationIdentity: GitHubInstallationIdentityPort,
  ) {}

  async claimAsOwner(input: ClaimInput): Promise<WorkspaceMemberRow> {
    const account = await this.installationIdentity.resolveInstallationIdentity(
      input.installationId,
    );
    return this.claimResolvedAccountAsOwner({
      userId: input.userId,
      installationId: input.installationId,
      ...account,
    });
  }

  private claimResolvedAccountAsOwner(input: ResolvedClaimInput): Promise<WorkspaceMemberRow> {
    return getDb().transaction(async (transaction) => {
      await workspacesRepo.upsertByGithubAccountId(
        {
          githubAccountId: input.githubAccountId,
          accountLogin: input.accountLogin,
          accountType: input.accountType,
        },
        transaction,
      );
      // The stable account row serializes competing first claims before either inspects owner state.
      const workspace = await workspacesRepo.getByGithubAccountIdForUpdate(
        input.githubAccountId,
        transaction,
      );
      if (!workspace) {
        throw new CoreException(ErrorType.WorkspaceNotFound);
      }

      await installationsRepo.upsertByGithubId(
        {
          githubInstallationId: input.installationId,
          githubAccountId: input.githubAccountId,
          accountLogin: input.accountLogin,
          accountType: input.accountType,
        },
        transaction,
      );
      const lockedMemberships = await workspaceMembersRepo.getMembershipsForUpdate(
        workspace.id,
        [input.userId],
        transaction,
      );
      const existing = lockedMemberships.find((member) => member.userId === input.userId);
      // Claims use the same workspace → memberships → users order as all authority writes.
      const actor = await usersRepo.getByIdForUpdate(input.userId, transaction);
      if (!actor || actor.globalStatus !== GLOBAL_STATUS.ACTIVE) {
        throw new CoreException(ErrorType.Forbidden);
      }
      const installation = await installationsRepo.getByGithubIdForUpdate(
        input.installationId,
        transaction,
      );
      if (installation) {
        // Webhooks can arrive before the user claims, so repair those synced rows while claiming.
        await installationsRepo.setGithubAccountId(
          installation.id,
          input.githubAccountId,
          transaction,
        );
        await repositoriesRepo.assignWorkspaceToInstallation(
          installation.id,
          workspace.id,
          transaction,
        );
      }
      const members = await workspaceMembersRepo.listByWorkspace(workspace.id, transaction);
      const hasOwner = members.some((member) => member.role === WORKSPACE_ROLE.OWNER);

      if (hasOwner) {
        return existing ?? this.membership.ensureReviewer(workspace.id, input.userId, transaction);
      }
      // A persisted suspension is authoritative and cannot be bypassed by reclaiming the install.
      if (existing?.status === MEMBERSHIP_STATUS.SUSPENDED) {
        return existing;
      }
      if (existing) {
        return this.promoteExisting(existing, input.userId, transaction);
      }

      const created = await workspaceMembersRepo.create(
        {
          workspaceId: workspace.id,
          userId: input.userId,
          role: WORKSPACE_ROLE.OWNER,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        transaction,
      );
      await auditLogsRepo.record(
        {
          actorUserId: input.userId,
          action: AUDIT_ACTION.WORKSPACE_CLAIM,
          targetType: "workspace_member",
          targetId: input.userId,
          workspaceId: workspace.id,
          before: { role: null, status: null },
          after: { role: created.role, status: created.status },
        },
        transaction,
      );
      return created;
    });
  }

  async currentContext(userId: string) {
    const user = await usersRepo.getById(userId);
    if (!user) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const workspace = await this.resolver.firstWorkspaceForUser(userId);
    const membership = workspace
      ? await workspaceMembersRepo.getMembership(workspace.id, userId)
      : null;
    const installations = workspace
      ? await this.resolver.listInstallationsForWorkspace(workspace.githubAccountId)
      : [];
    const onboardingState =
      membership?.status === MEMBERSHIP_STATUS.SUSPENDED
        ? INSTALLATION_ONBOARDING_STATE.MEMBERSHIP_SUSPENDED
        : !workspace || !membership
          ? INSTALLATION_ONBOARDING_STATE.INSTALL_REQUIRED
          : installations.some((installation) => installation.suspendedAt === null)
            ? INSTALLATION_ONBOARDING_STATE.READY
            : INSTALLATION_ONBOARDING_STATE.REINSTALL_REQUIRED;
    const entitlements: EntitlementFeature[] = [];
    for (const feature of Object.values(ENTITLEMENT_FEATURE)) {
      const decision = await this.entitlements.canUseFeature({
        userId,
        globalStatus: user.globalStatus,
        feature,
      });
      if (decision.entitled) {
        entitlements.push(feature);
      }
    }
    return {
      workspace: workspace ? { id: workspace.id, accountLogin: workspace.accountLogin } : null,
      role: membership?.role ?? null,
      memberStatus: membership?.status ?? null,
      globalStatus: user.globalStatus,
      isSystemAdmin: user.isSystemAdmin,
      entitlements,
      onboardingState,
    };
  }

  private async promoteExisting(
    existing: WorkspaceMemberRow,
    actorUserId: string,
    transaction: Parameters<typeof workspaceMembersRepo.updateRoleIfCurrent>[5],
  ): Promise<WorkspaceMemberRow> {
    const promoted = await workspaceMembersRepo.updateRoleIfCurrent(
      existing.id,
      existing.role,
      MEMBERSHIP_STATUS.ACTIVE,
      WORKSPACE_ROLE.OWNER,
      actorUserId,
      transaction,
    );
    if (!promoted) {
      throw new CoreException(ErrorType.WorkspaceMembershipConflict);
    }
    await auditLogsRepo.record(
      {
        actorUserId,
        action: AUDIT_ACTION.WORKSPACE_CLAIM,
        targetType: "workspace_member",
        targetId: existing.userId,
        workspaceId: existing.workspaceId,
        before: { role: existing.role, status: existing.status },
        after: { role: promoted.role, status: promoted.status },
      },
      transaction,
    );
    return promoted;
  }
}
