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
