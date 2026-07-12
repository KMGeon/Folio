import { adminWorkspacesRepo, type AdminWorkspaceSummary } from "@folio/db";
import type {
  AdminWorkspaceDetail,
  AdminWorkspaceInstallationState,
  AdminWorkspaceItem,
  AdminWorkspacePage,
} from "@folio/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import { projectAdminAuditRow } from "./admin-audit.facade.js";
import { decodeAdminPageCursor, encodeAdminPageCursor } from "./admin-page-cursor.js";

export interface AdminWorkspacesListQuery {
  limit: number;
  q?: string;
  installationState?: AdminWorkspaceInstallationState;
  cursor?: string;
}

@Injectable()
export class AdminWorkspacesFacade {
  async list(query: AdminWorkspacesListQuery): Promise<AdminWorkspacePage> {
    const page = await adminWorkspacesRepo.list({
      limit: query.limit,
      q: query.q,
      installationState: query.installationState,
      cursor: decodeAdminPageCursor(query.cursor),
    });
    const last = page.items.at(-1)?.workspace;
    return {
      items: page.items.map(projectAdminWorkspaceSummary),
      nextCursor:
        page.hasMore && last
          ? encodeAdminPageCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async detail(workspaceId: string): Promise<AdminWorkspaceDetail> {
    const row = await adminWorkspacesRepo.detail(workspaceId);
    if (!row) {
      throw new NotFoundException("Workspace not found");
    }
    return {
      ...projectAdminWorkspaceSummary(row),
      members: row.members.map((member) => ({
        ...member,
        joinedAt: member.joinedAt.toISOString(),
      })),
      repositories: row.repositories,
      installations: row.installations.map((installation) => ({
        ...installation,
        suspendedAt: installation.suspendedAt?.toISOString() ?? null,
      })),
      recentAudit: row.auditRows.map(projectAdminAuditRow),
    };
  }
}

export function projectAdminWorkspaceSummary(row: AdminWorkspaceSummary): AdminWorkspaceItem {
  return {
    id: row.workspace.id,
    accountLogin: row.workspace.accountLogin,
    accountType: row.workspace.accountType,
    createdAt: row.workspace.createdAt.toISOString(),
    owner: row.owner,
    memberCount: row.memberCount,
    repositoryCount: row.repositoryCount,
    enabledRepositoryCount: row.enabledRepositoryCount,
    installationState: row.installationState,
    recentActivityAt: row.recentActivityAt?.toISOString() ?? null,
  };
}
