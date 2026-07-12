import { adminJobsRepo, type AdminJobSummary } from "@folio/db";
import type {
  AdminJobDetail,
  AdminJobItem,
  AdminJobKind,
  AdminJobPage,
  AdminJobStatus,
} from "@folio/types";
import { Injectable, NotFoundException } from "@nestjs/common";
import { decodeAdminPageCursor, encodeAdminPageCursor } from "./admin-page-cursor.js";

export interface AdminJobsListQuery {
  limit: number;
  status?: AdminJobStatus;
  kind?: AdminJobKind;
  distressed?: boolean;
  jobId?: string;
  cursor?: string;
}

@Injectable()
export class AdminJobsFacade {
  async list(query: AdminJobsListQuery): Promise<AdminJobPage> {
    const page = await adminJobsRepo.list({
      limit: query.limit,
      status: query.status,
      kind: query.kind,
      distressed: query.distressed,
      jobId: query.jobId,
      cursor: decodeAdminPageCursor(query.cursor),
    });
    const last = page.items.at(-1)?.job;
    return {
      items: page.items.map(projectAdminJob),
      nextCursor:
        page.hasMore && last
          ? encodeAdminPageCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  async detail(jobId: string): Promise<AdminJobDetail> {
    const row = await adminJobsRepo.getById(jobId);
    if (!row) {
      throw new NotFoundException("Job not found");
    }
    return projectAdminJob(row);
  }
}

export function projectAdminJob(row: AdminJobSummary): AdminJobItem {
  return {
    id: row.job.id,
    kind: row.job.kind,
    status: row.job.status,
    attempts: row.job.attempts,
    maxAttempts: row.job.maxAttempts,
    runAfter: row.job.runAfter.toISOString(),
    leaseExpiresAt: row.job.leaseExpiresAt?.toISOString() ?? null,
    lockedBy: row.job.lockedBy,
    repository: row.repository,
    errorSummary: row.errorSummary,
    isDistressed: row.isDistressed,
    createdAt: row.job.createdAt.toISOString(),
    updatedAt: row.job.updatedAt.toISOString(),
  };
}
