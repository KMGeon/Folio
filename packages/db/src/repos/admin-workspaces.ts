import { and, desc, eq, ilike, inArray, isNotNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { type Db, getDb } from "../client.js";
import { auditLogs } from "../schema/audit-logs.js";
import { installations } from "../schema/installations.js";
import { repositories } from "../schema/repositories.js";
import { users } from "../schema/users.js";
import { workspaceMembers } from "../schema/workspace-members.js";
import { type WorkspaceRow, workspaces } from "../schema/workspaces.js";
import {
  installationStateCondition,
  stateForInstallations,
} from "./admin-workspace-installation-state.js";

const ownerUsers = alias(users, "admin_workspace_owner_users");

export interface AdminWorkspaceCursor {
  createdAt: Date;
  id: string;
}

export interface AdminWorkspaceListInput {
  q?: string;
  installationState?: "none" | "active" | "suspended" | "mixed";
  limit: number;
  cursor?: AdminWorkspaceCursor;
}

export interface AdminWorkspaceSummary {
  workspace: WorkspaceRow;
  owner: { id: string; login: string; avatarUrl: string } | null;
  memberCount: number;
  repositoryCount: number;
  enabledRepositoryCount: number;
  installationState: "none" | "active" | "suspended" | "mixed";
  recentActivityAt: Date | null;
}

export interface AdminWorkspaceDetailRow extends AdminWorkspaceSummary {
  members: {
    id: string;
    userId: string;
    login: string;
    avatarUrl: string;
    role: "owner" | "admin" | "reviewer";
    status: "active" | "suspended";
    joinedAt: Date;
  }[];
  repositories: { id: string; fullName: string; private: boolean; folioEnabled: boolean }[];
  installations: {
    id: string;
    githubInstallationId: number;
    accountLogin: string;
    accountType: "User" | "Organization";
    suspendedAt: Date | null;
  }[];
  auditRows: {
    audit: typeof auditLogs.$inferSelect;
    actorLogin: string;
    actorAvatarUrl: string;
    targetLabel: string;
    workspaceLogin: string | null;
  }[];
}

export const adminWorkspacesRepo = {
  async list(input: AdminWorkspaceListInput, db: Db = getDb()) {
    const query = input.q?.trim();
    const afterCursor = input.cursor
      ? or(
          lt(workspaces.createdAt, input.cursor.createdAt),
          and(eq(workspaces.createdAt, input.cursor.createdAt), lt(workspaces.id, input.cursor.id)),
        )
      : undefined;
    const rows = await db
      .select()
      .from(workspaces)
      .where(
        and(
          query ? ilike(workspaces.accountLogin, `%${query}%`) : undefined,
          installationStateCondition(input.installationState, db),
          afterCursor,
        ),
      )
      .orderBy(desc(workspaces.createdAt), desc(workspaces.id))
      .limit(input.limit + 1);
    const page = rows.slice(0, input.limit);
    return { items: await loadSummaries(page, db), hasMore: rows.length > input.limit };
  },

  async detail(workspaceId: string, db: Db = getDb()): Promise<AdminWorkspaceDetailRow | null> {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!workspace) {
      return null;
    }
    const [summary] = await loadSummaries([workspace], db);
    if (!summary) {
      return null;
    }
    const [members, repositoryRows, installationRows, auditRows] = await Promise.all([
      db
        .select({ member: workspaceMembers, login: users.login, avatarUrl: users.avatarUrl })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, workspace.id))
        .orderBy(desc(workspaceMembers.joinedAt)),
      db
        .select({
          id: repositories.id,
          fullName: repositories.fullName,
          private: repositories.private,
          folioEnabled: repositories.folioEnabled,
        })
        .from(repositories)
        .where(eq(repositories.workspaceId, workspace.id))
        .orderBy(repositories.fullName),
      db
        .select({
          id: installations.id,
          githubInstallationId: installations.githubInstallationId,
          accountLogin: installations.accountLogin,
          accountType: installations.accountType,
          suspendedAt: installations.suspendedAt,
        })
        .from(installations)
        .where(eq(installations.githubAccountId, workspace.githubAccountId))
        .orderBy(desc(installations.createdAt)),
      loadAuditRows(workspace.id, db),
    ]);
    return {
      ...summary,
      members: members.map(({ member, login, avatarUrl }) => ({
        id: member.id,
        userId: member.userId,
        login,
        avatarUrl,
        role: member.role,
        status: member.status,
        joinedAt: member.joinedAt,
      })),
      repositories: repositoryRows,
      installations: installationRows,
      auditRows,
    };
  },

  async countOverview(db: Db = getDb()) {
    const [workspaceRows, enabledRepositories, suspendedInstallations] = await Promise.all([
      db.select({ id: workspaces.id }).from(workspaces),
      db
        .select({ id: repositories.id })
        .from(repositories)
        .where(eq(repositories.folioEnabled, true)),
      db
        .select({ id: installations.id })
        .from(installations)
        .where(isNotNull(installations.suspendedAt)),
    ]);
    return {
      workspaces: workspaceRows.length,
      enabledRepositories: enabledRepositories.length,
      suspendedInstallations: suspendedInstallations.length,
    };
  },
};

async function loadSummaries(rows: WorkspaceRow[], db: Db): Promise<AdminWorkspaceSummary[]> {
  if (!rows.length) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  // Every batch query is constrained to the current workspace page to prevent metadata bleed.
  const [memberRows, repositoryRows, installationRows, auditRows] = await Promise.all([
    db
      .select({
        workspaceId: workspaceMembers.workspaceId,
        role: workspaceMembers.role,
        user: ownerUsers,
      })
      .from(workspaceMembers)
      .leftJoin(ownerUsers, eq(workspaceMembers.userId, ownerUsers.id))
      .where(inArray(workspaceMembers.workspaceId, ids)),
    db
      .select({ workspaceId: repositories.workspaceId, folioEnabled: repositories.folioEnabled })
      .from(repositories)
      .where(inArray(repositories.workspaceId, ids)),
    db
      .select({
        githubAccountId: installations.githubAccountId,
        suspendedAt: installations.suspendedAt,
      })
      .from(installations)
      .where(
        inArray(
          installations.githubAccountId,
          rows.map((row) => row.githubAccountId),
        ),
      ),
    db
      .select({ workspaceId: auditLogs.workspaceId, createdAt: auditLogs.createdAt })
      .from(auditLogs)
      .where(inArray(auditLogs.workspaceId, ids)),
  ]);
  return rows.map((workspace) => {
    const members = memberRows.filter((row) => row.workspaceId === workspace.id);
    const repositoryValues = repositoryRows.filter((row) => row.workspaceId === workspace.id);
    const matchingInstallations = installationRows.filter(
      (row) => row.githubAccountId === workspace.githubAccountId,
    );
    const activities = auditRows.filter((row) => row.workspaceId === workspace.id);
    const owner = members.find((row) => row.role === "owner")?.user;
    return {
      workspace,
      owner: owner ? { id: owner.id, login: owner.login, avatarUrl: owner.avatarUrl } : null,
      memberCount: members.length,
      repositoryCount: repositoryValues.length,
      enabledRepositoryCount: repositoryValues.filter((row) => row.folioEnabled).length,
      installationState: stateForInstallations(matchingInstallations),
      recentActivityAt: activities.reduce<Date | null>(
        (latest, activity) =>
          !latest || activity.createdAt > latest ? activity.createdAt : latest,
        null,
      ),
    };
  });
}

async function loadAuditRows(workspaceId: string, db: Db) {
  const actorUsers = alias(users, "admin_workspace_audit_actor_users");
  return db
    .select({
      audit: auditLogs,
      actorLogin: actorUsers.login,
      actorAvatarUrl: actorUsers.avatarUrl,
      targetLabel: auditLogs.targetId,
      workspaceLogin: workspaces.accountLogin,
    })
    .from(auditLogs)
    .innerJoin(actorUsers, eq(auditLogs.actorUserId, actorUsers.id))
    .innerJoin(workspaces, eq(auditLogs.workspaceId, workspaces.id))
    .where(eq(auditLogs.workspaceId, workspaceId))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(10);
}
