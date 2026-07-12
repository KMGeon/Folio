import { adminAnalyticsRepo } from "@folio/db";
import type { AdminAnalyticsPayload, AdminAnalyticsRange } from "@folio/types";

export class AdminAnalyticsFacade {
  async get(
    range: AdminAnalyticsRange = "7d",
    now: Date = new Date(),
  ): Promise<AdminAnalyticsPayload> {
    const rangeDays = range === "30d" ? 30 : 7;
    const projection = await adminAnalyticsRepo.getProjection(rangeDays, undefined, now);
    const jobs = new Map(projection.dailyJobs.map((item) => [item.date, item]));
    const users = new Map(projection.dailyUsers.map((item) => [item.date, item]));
    const workspaces = new Map(projection.dailyWorkspaces.map((item) => [item.date, item]));
    const repositories = new Map(
      projection.dailyEnabledRepositories.map((item) => [item.date, item]),
    );
    const audit = new Map(projection.dailyAudit.map((item) => [item.date, item]));

    return {
      range,
      days: Array.from({ length: rangeDays }, (_, offset) => {
        const date = utcDate(rangeDays - offset - 1, now);
        const job = jobs.get(date);
        return {
          date,
          jobs: { succeeded: job?.succeeded ?? 0, failed: job?.failed ?? 0, dead: job?.dead ?? 0 },
          users: { created: users.get(date)?.created ?? 0 },
          workspaces: {
            created: workspaces.get(date)?.created ?? 0,
            // The repository record has no activation timestamp; creation is the only honest trend source.
            enabledRepositories: repositories.get(date)?.enabledRepositories ?? 0,
          },
          audit: { events: audit.get(date)?.events ?? 0 },
        };
      }),
      distributions: {
        jobs: projection.jobStatuses,
        users: projection.userStatuses,
        installations: projection.installationStates,
        audit: projection.auditActions,
        jobKinds: projection.jobKinds,
      },
    };
  }
}

function utcDate(daysAgo: number, now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}
