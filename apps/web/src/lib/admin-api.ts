import type {
  AdminAuditPage,
  AdminOverviewPayload,
  AdminUserPage,
  AdminUserStatusFilter,
  AuditAction,
} from "@folio/types";

import { ApiError, apiRequest } from "./api-client";

export interface AdminUserFilters {
  q?: string;
  status?: AdminUserStatusFilter;
  limit?: number;
  cursor?: string;
}

export interface AdminAuditFilters {
  q?: string;
  action?: AuditAction;
  workspaceId?: string;
  actorUserId?: string;
  targetId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

interface ServerCookieOptions {
  cookie?: string;
}

export function fetchAdminUsers(
  options: AdminUserFilters & ServerCookieOptions = {},
): Promise<AdminUserPage> {
  const { cookie, ...filters } = options;
  return adminRequest<AdminUserPage>(withQuery("/api/v1/admin/users", filters), cookie);
}

export function fetchAdminAudit(
  options: AdminAuditFilters & ServerCookieOptions = {},
): Promise<AdminAuditPage> {
  const { cookie, ...filters } = options;
  return adminRequest<AdminAuditPage>(withQuery("/api/v1/admin/audit-logs", filters), cookie);
}

export function fetchAdminOverview(
  options: ServerCookieOptions = {},
): Promise<AdminOverviewPayload> {
  return adminRequest<AdminOverviewPayload>("/api/v1/admin/overview", options.cookie);
}

export function approveAdminUser(id: string): Promise<{ ok: true }> {
  return adminMutation(`/api/v1/admin/users/${encodeURIComponent(id)}/approve`);
}

export function suspendAdminUser(id: string): Promise<{ ok: true }> {
  return adminMutation(`/api/v1/admin/users/${encodeURIComponent(id)}/suspend`);
}

export function transferSystemAdmin(userId: string): Promise<{ ok: true }> {
  return adminMutation("/api/v1/admin/system-admin/transfer", { userId });
}

function adminMutation(path: string, body?: unknown): Promise<{ ok: true }> {
  return adminRequest<{ ok: true }>(path, undefined, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function adminRequest<T>(path: string, cookie?: string, init: RequestInit = {}): Promise<T> {
  try {
    return await apiRequest<T>(path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 403 && typeof window !== "undefined") {
      window.location.href = "/dashboard";
      return new Promise<T>(() => {});
    }
    throw error;
  }
}

function withQuery(path: string, filters: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  const encoded = query.toString();
  return encoded ? `${path}?${encoded}` : path;
}
