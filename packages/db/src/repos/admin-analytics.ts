import { and, eq, gte, sql, type AnyColumn } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { auditLogs } from "../schema/audit-logs.js";
import { installations } from "../schema/installations.js";
import { jobs } from "../schema/jobs.js";
import { repositories } from "../schema/repositories.js";
import { users } from "../schema/users.js";
import { workspaces } from "../schema/workspaces.js";

export interface AdminAnalyticsProjection {
  dailyJobs: { date: string; succeeded: number; failed: number; dead: number }[];
  dailyUsers: { date: string; created: number }[];
  dailyWorkspaces: { date: string; created: number }[];
  dailyEnabledRepositories: { date: string; enabledRepositories: number }[];
  dailyAudit: { date: string; events: number }[];
  jobStatuses: { key: string; value: number }[];
  userStatuses: { key: string; value: number }[];
  installationStates: { key: string; value: number }[];
  auditActions: { key: string; value: number }[];
  jobKinds: { key: string; value: number }[];
}

const dayOf = (column: AnyColumn) =>
  sql<string>`to_char(date_trunc('day', ${column} at time zone 'UTC'), 'YYYY-MM-DD')`;

export const adminAnalyticsRepo = {
  async getProjection(
    rangeDays: 7 | 30,
    db: Db = getDb(),
    now: Date = new Date(),
  ): Promise<AdminAnalyticsProjection> {
    const start = startOfUtcRange(rangeDays, now);
    const jobDay = dayOf(jobs.updatedAt);
    const userDay = dayOf(users.createdAt);
    const workspaceDay = dayOf(workspaces.createdAt);
    const repositoryDay = dayOf(repositories.createdAt);
    const auditDay = dayOf(auditLogs.createdAt);

    const [
      dailyJobs,
      dailyUsers,
      dailyWorkspaces,
      dailyEnabledRepositories,
      dailyAudit,
      jobStatuses,
      userStatuses,
      installationStates,
      auditActions,
      jobKinds,
    ] = await Promise.all([
      db
        .select({
          date: jobDay,
          succeeded: sql<number>`count(*) filter (where ${jobs.status} = 'succeeded')::int`,
          failed: sql<number>`count(*) filter (where ${jobs.status} = 'failed')::int`,
          dead: sql<number>`count(*) filter (where ${jobs.status} = 'dead')::int`,
        })
        .from(jobs)
        .where(gte(jobs.updatedAt, start))
        .groupBy(jobDay)
        .orderBy(jobDay),
      db
        .select({ date: userDay, created: sql<number>`count(*)::int` })
        .from(users)
        .where(gte(users.createdAt, start))
        .groupBy(userDay)
        .orderBy(userDay),
      db
        .select({ date: workspaceDay, created: sql<number>`count(*)::int` })
        .from(workspaces)
        .where(gte(workspaces.createdAt, start))
        .groupBy(workspaceDay)
        .orderBy(workspaceDay),
      db
        .select({ date: repositoryDay, enabledRepositories: sql<number>`count(*)::int` })
        .from(repositories)
        .where(and(gte(repositories.createdAt, start), eq(repositories.folioEnabled, true)))
        .groupBy(repositoryDay)
        .orderBy(repositoryDay),
      db
        .select({ date: auditDay, events: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, start))
        .groupBy(auditDay)
        .orderBy(auditDay),
      db
        .select({ key: jobs.status, value: sql<number>`count(*)::int` })
        .from(jobs)
        .groupBy(jobs.status),
      db
        .select({ key: users.globalStatus, value: sql<number>`count(*)::int` })
        .from(users)
        .groupBy(users.globalStatus),
      db
        .select({
          key: sql<string>`case when ${installations.suspendedAt} is null then 'active' else 'suspended' end`,
          value: sql<number>`count(*)::int`,
        })
        .from(installations)
        .groupBy(
          sql`case when ${installations.suspendedAt} is null then 'active' else 'suspended' end`,
        ),
      db
        .select({ key: auditLogs.action, value: sql<number>`count(*)::int` })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, start))
        .groupBy(auditLogs.action),
      db
        .select({ key: jobs.kind, value: sql<number>`count(*)::int` })
        .from(jobs)
        .where(gte(jobs.createdAt, start))
        .groupBy(jobs.kind),
    ]);

    return {
      dailyJobs,
      dailyUsers,
      dailyWorkspaces,
      dailyEnabledRepositories,
      dailyAudit,
      jobStatuses,
      userStatuses,
      installationStates,
      auditActions,
      jobKinds,
    };
  },
};

function startOfUtcRange(rangeDays: number, now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - rangeDays + 1);
  return start;
}
