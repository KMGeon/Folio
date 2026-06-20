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
  InternalError: {
    code: "internal_error",
    statusCode: 500,
    message: "An internal backend error occurred.",
  },
} as const satisfies Record<string, ErrorTypeDefinition>;
