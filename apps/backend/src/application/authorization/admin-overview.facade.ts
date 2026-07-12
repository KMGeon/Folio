import {
  adminAuditRepo,
  adminHealthRepo,
  adminJobsRepo,
  adminUsersRepo,
  adminWorkspacesRepo,
} from "@folio/db";
import type { AdminOverviewPayload } from "@folio/types";
import { Injectable } from "@nestjs/common";
import { projectAdminAuditRow } from "./admin-audit.facade.js";

@Injectable()
export class AdminOverviewFacade {
  async get(): Promise<AdminOverviewPayload> {
    const [pendingUsers, auditPage, workspaceCounts, queueCounts, health] = await Promise.all([
      adminUsersRepo.countPending(),
      adminAuditRepo.list({ limit: 5 }),
      adminWorkspacesRepo.countOverview(),
      adminJobsRepo.countOverview(),
      adminHealthRepo.getProjection(),
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
    if (queueCounts.distressedJobs > 0) {
      attention.push({ kind: "distressed_jobs", count: queueCounts.distressedJobs });
    }
    if (health.worker.status === "stale") {
      attention.push({ kind: "worker_stale", count: Math.max(1, health.worker.workers.length) });
    }
    // unknown is noisy in empty dev DBs — only alert in prd.
    if (health.worker.status === "unknown" && process.env.APP_PROFILE === "prd") {
      attention.push({ kind: "worker_unknown", count: 1 });
    }

    return {
      metrics: {
        pendingUsers,
        workspaces: workspaceCounts.workspaces,
        enabledRepositories: workspaceCounts.enabledRepositories,
        distressedJobs: queueCounts.distressedJobs,
      },
      attention,
      queueSnapshot: {
        pending: queueCounts.pending,
        running: queueCounts.running,
        retrying: queueCounts.retrying,
        succeededLast24h: queueCounts.succeededLast24h,
        deadLast24h: queueCounts.deadLast24h,
      },
      recentAudit: auditPage.items.slice(0, 5).map(projectAdminAuditRow),
    };
  }
}
