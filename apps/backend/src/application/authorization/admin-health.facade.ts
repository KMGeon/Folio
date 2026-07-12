import { adminHealthRepo } from "@folio/db";
import type { AdminHealthPayload } from "@folio/types";
import { Injectable } from "@nestjs/common";

@Injectable()
export class AdminHealthFacade {
  async get(): Promise<AdminHealthPayload> {
    const projection = await adminHealthRepo.getProjection();
    return {
      checkedAt: projection.checkedAt.toISOString(),
      worker: {
        status: projection.worker.status,
        staleAfterSeconds: projection.worker.staleAfterSeconds,
        workers: projection.worker.workers.map((worker) => ({
          workerId: worker.workerId,
          lastSeenAt: worker.lastSeenAt.toISOString(),
          startedAt: worker.startedAt.toISOString(),
          ageSeconds: worker.ageSeconds,
          status: worker.status,
        })),
      },
      codexPath: {
        status: projection.codexPath.status,
        lastReviewPullSucceededAt:
          projection.codexPath.lastReviewPullSucceededAt?.toISOString() ?? null,
        reviewPullSucceededLast24h: projection.codexPath.reviewPullSucceededLast24h,
        reviewPullFailedLast24h: projection.codexPath.reviewPullFailedLast24h,
        note: projection.codexPath.note,
      },
      queue: projection.queue,
    };
  }
}
