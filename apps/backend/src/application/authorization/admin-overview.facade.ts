import { adminAuditRepo, adminUsersRepo, adminWorkspacesRepo } from "@folio/db";
import type { AdminOverviewPayload } from "@folio/types";
import { Injectable } from "@nestjs/common";
import { projectAdminAuditRow } from "./admin-audit.facade.js";

@Injectable()
export class AdminOverviewFacade {
  async get(): Promise<AdminOverviewPayload> {
    const [pendingUsers, auditPage, workspaceCounts] = await Promise.all([
      adminUsersRepo.countPending(),
      adminAuditRepo.list({ limit: 5 }),
      adminWorkspacesRepo.countOverview(),
    ]);

    const attention = [] as AdminOverviewPayload["attention"];
    if (pendingUsers > 0) {
      attention.push({ kind: "pending_users", count: pendingUsers });
    }
    if (workspaceCounts.suspendedInstallations > 0) {
      attention.push({
        kind: "suspended_installations",
        count: workspaceCounts.suspendedInstallations,
      });
    }

    return {
      metrics: {
        pendingUsers,
        workspaces: workspaceCounts.workspaces,
        enabledRepositories: workspaceCounts.enabledRepositories,
      },
      attention,
      recentAudit: auditPage.items.slice(0, 5).map(projectAdminAuditRow),
    };
  }
}
