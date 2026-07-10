import { webEnv } from "./env";

export function loginUrl(redirectPath = "/"): string {
  const url = new URL("/api/v1/auth/github/login", webEnv.apiBaseUrl);
  url.searchParams.set("redirect", redirectPath);
  return url.toString();
}

export function logoutUrl(): string {
  return new URL("/api/v1/auth/logout", webEnv.apiBaseUrl).toString();
}

export interface SessionUser {
  id: string;
  login: string;
  avatarUrl: string;
}

export interface PendingUser {
  id: string;
  login: string;
  avatarUrl: string;
  email: string | null;
  createdAt: string;
}

/**
 * Returns the current user, or null when unauthenticated. Pass `cookie` from a
 * server component (credentials:"include" only attaches cookies in the browser).
 */
export async function getMe(cookie?: string): Promise<SessionUser | null> {
  const res = await fetch(new URL("/api/v1/auth/me", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) {
    return null;
  }
  const payload = (await res.json()) as { success: boolean; data?: { user: SessionUser } };
  return payload.success && payload.data ? payload.data.user : null;
}

export async function getPendingUsers(cookie?: string): Promise<PendingUser[]> {
  const res = await fetch(new URL("/api/v1/auth/admin/users/pending", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) {
    return [];
  }
  const payload = (await res.json()) as { success: boolean; data?: { users: PendingUser[] } };
  return payload.success && payload.data ? payload.data.users : [];
}

export async function approvePendingUser(id: string): Promise<PendingUser> {
  const res = await fetch(new URL(`/api/v1/auth/admin/users/${id}/approve`, webEnv.apiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = (await res.json()) as {
    success: boolean;
    data?: { user: PendingUser };
    error?: { message: string };
  };
  if (!res.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? "승인에 실패했습니다.");
  }
  return payload.data.user;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  role: "owner" | "admin" | "reviewer";
  status: "active" | "suspended";
}

export interface GlobalUser {
  id: string;
  login: string;
  avatarUrl: string;
  email: string | null;
  globalStatus: "pending" | "active" | "suspended";
  isSystemAdmin: boolean;
  createdAt: string;
}

export async function listWorkspaceMembers(
  workspaceId: string,
  cookie?: string,
): Promise<WorkspaceMember[]> {
  const res = await fetch(new URL(`/api/v1/workspaces/${workspaceId}/members`, webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) {
    return [];
  }
  const payload = (await res.json()) as { success: boolean; data?: { members: WorkspaceMember[] } };
  return payload.success && payload.data ? payload.data.members : [];
}

async function memberAction(
  workspaceId: string,
  path: string,
  method: "POST" | "DELETE" | "PATCH",
  body?: unknown,
): Promise<void> {
  const res = await fetch(
    new URL(`/api/v1/workspaces/${workspaceId}/members/${path}`, webEnv.apiBaseUrl),
    {
      method,
      credentials: "include",
      headers: { accept: "application/json", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const payload = (await res.json()) as { success: boolean; error?: { message: string } };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "요청에 실패했습니다.");
  }
}

export const suspendMember = (ws: string, userId: string) =>
  memberAction(ws, `${userId}/suspend`, "POST");
export const restoreMember = (ws: string, userId: string) =>
  memberAction(ws, `${userId}/restore`, "POST");
export const removeMember = (ws: string, userId: string) => memberAction(ws, userId, "DELETE");
export const changeMemberRole = (ws: string, userId: string, role: string) =>
  memberAction(ws, `${userId}/role`, "PATCH", { role });
export const transferOwnership = (ws: string, userId: string) =>
  memberAction(ws, "transfer-ownership", "POST", { userId });

export async function listGlobalUsers(cookie?: string): Promise<GlobalUser[]> {
  const res = await fetch(new URL("/api/v1/admin/users", webEnv.apiBaseUrl), {
    credentials: "include",
    headers: { accept: "application/json", ...(cookie ? { cookie } : {}) },
  });
  if (!res.ok) {
    return [];
  }
  const payload = (await res.json()) as { success: boolean; data?: { users: GlobalUser[] } };
  return payload.success && payload.data ? payload.data.users : [];
}

export async function approveGlobalUser(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/v1/admin/users/${id}/approve`, webEnv.apiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = (await res.json()) as { success: boolean; error?: { message: string } };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "승인에 실패했습니다.");
  }
}

export async function suspendGlobalUser(id: string): Promise<void> {
  const res = await fetch(new URL(`/api/v1/admin/users/${id}/suspend`, webEnv.apiBaseUrl), {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json" },
  });
  const payload = (await res.json()) as { success: boolean; error?: { message: string } };
  if (!res.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "정지에 실패했습니다.");
  }
}
