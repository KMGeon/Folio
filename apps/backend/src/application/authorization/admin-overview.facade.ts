import { adminAuditRepo, adminUsersRepo } from "@folio/db";
import type { AdminOverviewPayload } from "@folio/types";
import { Injectable } from "@nestjs/common";
import { projectAdminAuditRow } from "./admin-audit.facade.js";

@Injectable()
export class AdminOverviewFacade {
  async get(): Promise<AdminOverviewPayload> {
    const [pendingUsers, auditPage] = await Promise.all([
      adminUsersRepo.countPending(),
      adminAuditRepo.list({ limit: 5 }),
    ]);

    return {
      metrics: { pendingUsers },
      attention: pendingUsers > 0 ? [{ kind: "pending_users", count: pendingUsers }] : [],
      recentAudit: auditPage.items.slice(0, 5).map(projectAdminAuditRow),
    };
  }
}
