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
  InternalError: {
    code: "internal_error",
    statusCode: 500,
    message: "An internal backend error occurred.",
  },
} as const satisfies Record<string, ErrorTypeDefinition>;
