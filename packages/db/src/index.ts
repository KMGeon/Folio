// Client
export { type Db, getDb, closeDb, runMigrations } from "./client.js";

// Schema (tables + row/insert types)
export * as schema from "./schema/index.js";
export * from "./schema/index.js";

// Repositories
export * from "./repos/index.js";

// Job queue (authoritative F3 Job contract implementation)
export {
  JOB_KIND,
  JOB_STATUS,
  type Job,
  type JobWire,
  type JobKind,
  type JobStatus,
  type EnqueueJobInput,
  type EnqueueJobOutcome,
  type ClaimJobOptions,
  enqueueJob,
  enqueueJobWithOutcome,
  getLatestJobsByDedupeKeys,
  findActiveJobByDedupeKey,
  claimJob,
  renewJobLease,
  completeJob,
  failJob,
  reclaimExpiredJobs,
  getJob,
  toJobWire,
  backoffUntil,
  dedupeKeyFor,
} from "./queue/jobs.js";
