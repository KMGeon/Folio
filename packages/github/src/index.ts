// ─── Config ──────────────────────────────────────────────────────────────────
export {
  type GitHubConfig,
  GitHubConfigSchema,
  loadGitHubConfig,
  normalizePrivateKey,
} from "./config.js";

// ─── Ref ─────────────────────────────────────────────────────────────────────
export { type PullRequestRef, parseRepoFullName } from "./ref.js";

// ─── Auth ────────────────────────────────────────────────────────────────────
export {
  type AppJwtOptions,
  createAppJwt,
  decodeJwtClaims,
  MAX_JWT_TTL_SECONDS,
} from "./auth/app-jwt.js";
export {
  type AppAuthFn,
  configureInstallationAuth,
  getInstallationToken,
  type InstallationToken,
  resetInstallationAuth,
} from "./auth/installation-token.js";
export {
  buildAuthorizeUrl,
  exchangeOAuthCode,
  getAuthenticatedUser,
  type OAuthUser,
} from "./auth/user-oauth.js";

// ─── Client ──────────────────────────────────────────────────────────────────
export {
  appJwt,
  configureClients,
  createAppOctokit,
  createInstallationOctokit,
  resetClients,
} from "./client.js";

// ─── Webhook ─────────────────────────────────────────────────────────────────
export { verifyWebhookSignature } from "./webhook/verify.js";
export {
  type CheckRunEventPayload,
  type CheckSuiteEventPayload,
  type InstallationEventPayload,
  type InstallationRepositoriesEventPayload,
  type IssueCommentEventPayload,
  parseWebhookEvent,
  type PullRequestEventPayload,
  type PullRequestReviewCommentEventPayload,
  type PullRequestReviewEventPayload,
  type RepositoryRefPayload,
  SUBSCRIBED_EVENTS,
  type SubscribedEventName,
  type WebhookEvent,
} from "./webhook/events.js";

// ─── Pull request ────────────────────────────────────────────────────────────
export {
  createReviewComment,
  getPullRequest,
  getPullRequestCommits,
  getPullRequestDiff,
  getRepositoryCommits,
  getReviewComments,
  getReviews,
  listPullRequestFiles,
  type CreatedReviewComment,
  type CreateReviewCommentInput,
  type PullRequestCommit,
  type PullRequestCommitPage,
  type PullRequestFile,
  type PullRequestSummary,
  type ReviewCommentSummary,
  type ReviewSummary,
} from "./pull-request.js";

// ─── Repo permission ─────────────────────────────────────────────────────────────
export {
  checkUserRepoPermission,
  type GitHubRepoAccessLevel,
  getUserRepoPermissionLevel,
} from "./repo-permission.js";

// ─── Comments ────────────────────────────────────────────────────────────────
export {
  commentMarker,
  createIssueComment,
  findMarkedComment,
  type IssueComment,
  listIssueComments,
  updateIssueComment,
  upsertMarkedComment,
  withMarker,
} from "./comments.js";

// ─── Check Run ───────────────────────────────────────────────────────────────
export {
  buildCheckRunBody,
  type CheckRunAction,
  type CheckRunConclusion,
  type CheckRunInput,
  type CheckRunOutput,
  type CheckRunStatus,
  createCheckRun,
  updateCheckRun,
} from "./check-run.js";

// ─── Rate limiting ───────────────────────────────────────────────────────────
export { RateLimitError, type RateLimitRetryOptions, withRateLimitRetry } from "./rate-limit.js";

// ─── Install ─────────────────────────────────────────────────────────────────
export { getInstallationUrl, listInstallationRepos } from "./install.js";
