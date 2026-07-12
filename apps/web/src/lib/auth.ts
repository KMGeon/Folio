import type { MembershipStatus, WorkspaceRole } from "@folio/types";
import { webEnv } from "./env";

interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
}

interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
  };
  path: string;
  timestamp: string;
}

type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export class AuthorizationApiError extends Error {
  readonly shouldRefresh: boolean;

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly path?: string,
    readonly timestamp?: string,
  ) {
    super(message);
    this.name = "AuthorizationApiError";
    // Conflicts mean the authorization snapshot is stale, so callers should reload it.
    this.shouldRefresh = status === 409;
  }
}

export interface SessionUser {
  id: string;
  login: string;
  avatarUrl: string;
  isSystemAdmin: boolean;
}

export interface WorkspaceMember {
  userId: string;
  login: string;
  avatarUrl: string;
  email: string | null;
  role: WorkspaceRole;
  status: MembershipStatus;
}

export interface MutationResult {
  ok: true;
}

export function loginUrl(redirectPath = "/"): string {
  const url = new URL("/api/v1/auth/github/login", webEnv.apiBaseUrl);
  url.searchParams.set("redirect", redirectPath);
  return url.toString();
}

export function logoutUrl(): string {
  return new URL("/api/v1/auth/logout", webEnv.apiBaseUrl).toString();
}

export function installationUrl(): string {
  return new URL("/api/v1/auth/github/install", webEnv.apiBaseUrl).toString();
}

/**
 * Returns the current user, or null when unauthenticated. Pass `cookie` from a
 * server component (credentials:"include" only attaches cookies in the browser).
 */
export async function getMe(cookie?: string): Promise<SessionUser | null> {
  const response = await fetch(new URL("/api/v1/auth/me", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: requestHeaders(cookie),
  });
  if (response.status === 401) {
    return null;
  }
  const data = await readApiPayload<{ user: SessionUser }>(
    response,
    "사용자 정보를 불러오지 못했습니다.",
  );
  return data.user;
}

export async function listWorkspaceMembers(
  workspaceId: string,
  cookie?: string,
): Promise<WorkspaceMember[]> {
  const response = await fetch(
    new URL(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members`, webEnv.apiBaseUrl),
    {
      credentials: "include",
      headers: requestHeaders(cookie),
    },
  );
  const data = await readApiPayload<{ members: WorkspaceMember[] }>(
    response,
    "워크스페이스 멤버를 불러오지 못했습니다.",
  );
  return data.members;
}

export const suspendMember = (workspaceId: string, userId: string) =>
  memberAction(workspaceId, `${encodeURIComponent(userId)}/suspend`, "POST");

export const restoreMember = (workspaceId: string, userId: string) =>
  memberAction(workspaceId, `${encodeURIComponent(userId)}/restore`, "POST");

export const removeMember = (workspaceId: string, userId: string) =>
  memberAction(workspaceId, encodeURIComponent(userId), "DELETE");

export const changeMemberRole = (workspaceId: string, userId: string, role: WorkspaceRole) =>
  memberAction(workspaceId, `${encodeURIComponent(userId)}/role`, "PATCH", { role });

export const transferOwnership = (workspaceId: string, userId: string) =>
  memberAction(workspaceId, "transfer-ownership", "POST", { userId });

async function memberAction(
  workspaceId: string,
  path: string,
  method: "POST" | "DELETE" | "PATCH",
  body?: unknown,
): Promise<MutationResult> {
  const response = await fetch(
    new URL(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members/${path}`,
      webEnv.apiBaseUrl,
    ),
    mutationInit(method, body),
  );
  return readApiPayload<MutationResult>(response, "요청에 실패했습니다.");
}

function requestHeaders(cookie?: string): Record<string, string> {
  return { accept: "application/json", ...(cookie ? { cookie } : {}) };
}

function mutationInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

async function readApiPayload<T>(response: Response, fallbackMessage: string): Promise<T> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new AuthorizationApiError(fallbackMessage, response.status, "invalid_response");
  }

  if (!isApiEnvelope<T>(value)) {
    throw new AuthorizationApiError(fallbackMessage, response.status, "invalid_response");
  }

  if (!value.success) {
    throw new AuthorizationApiError(
      value.error.message,
      response.status,
      value.error.code,
      value.path,
      value.timestamp,
    );
  }
  if (!response.ok) {
    throw new AuthorizationApiError(fallbackMessage, response.status, "invalid_response");
  }
  return value.data;
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  if (!value || typeof value !== "object" || !("success" in value)) {
    return false;
  }
  if (value.success === true) {
    return "data" in value && value.data !== undefined;
  }
  if (value.success !== false || !("error" in value)) {
    return false;
  }
  const error = value.error;
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    "path" in value &&
    typeof value.path === "string" &&
    "timestamp" in value &&
    typeof value.timestamp === "string"
  );
}
