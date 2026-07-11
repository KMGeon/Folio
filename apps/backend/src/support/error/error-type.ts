export interface ErrorTypeDefinition {
  readonly code: string;
  readonly statusCode: number;
  readonly message: string;
}

export const ErrorType = {
  MissingGitHubHeaders: {
    code: "missing_github_headers",
    statusCode: 400,
    message: "Required GitHub webhook headers are missing.",
  },
  InvalidSignature: {
    code: "invalid_signature",
    statusCode: 401,
    message: "GitHub webhook signature is invalid.",
  },
  Unauthorized: {
    code: "unauthorized",
    statusCode: 401,
    message: "Authentication is required.",
  },
  OAuthStateMismatch: {
    code: "oauth_state_mismatch",
    statusCode: 400,
    message: "OAuth state did not match.",
  },
  RepoAccessDenied: {
    code: "repo_access_denied",
    statusCode: 403,
    message: "You do not have access to this repository.",
  },
  Forbidden: {
    code: "forbidden",
    statusCode: 403,
    message: "You are not allowed to perform this action.",
  },
  InvalidAdminCursor: {
    code: "invalid_admin_cursor",
    statusCode: 400,
    message: "The admin page cursor is invalid.",
  },
  WorkspaceNotFound: {
    code: "workspace_not_found",
    statusCode: 404,
    message: "Workspace not found.",
  },
  UserNotFound: {
    code: "user_not_found",
    statusCode: 404,
    message: "User not found.",
  },
  GlobalUserConflict: {
    code: "global_user_conflict",
    statusCode: 409,
    message: "Global user authority changed. Refresh and try again.",
  },
  WorkspaceMembershipConflict: {
    code: "workspace_membership_conflict",
    statusCode: 409,
    message: "Workspace membership changed. Refresh and try again.",
  },
  RepositoryDisconnected: {
    code: "repository_disconnected",
    statusCode: 409,
    message: "Repository is no longer connected to the GitHub App.",
  },
  NotEntitled: {
    code: "not_entitled",
    statusCode: 403,
    message: "Your plan does not include this feature.",
  },
  InternalError: {
    code: "internal_error",
    statusCode: 500,
    message: "An internal backend error occurred.",
  },
} as const satisfies Record<string, ErrorTypeDefinition>;
