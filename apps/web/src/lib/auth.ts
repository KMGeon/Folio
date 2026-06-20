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
  login: string;
  avatarUrl: string;
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
