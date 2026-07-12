import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api-client";

const ADMIN_FALLBACK_PATH = "/admin/overview";
const VALIDATION_ORIGIN = "http://folio.internal";

export interface AdminServerAccess {
  cookie: string;
  returnPath: string;
}

export async function getAdminServerAccess(): Promise<AdminServerAccess> {
  const cookie = (await cookies())
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
  const rawPath = (await headers()).get("x-folio-request-path");

  return { cookie, returnPath: validatedAdminReturnPath(rawPath) };
}

export async function readAdminServerData<T>(
  access: AdminServerAccess,
  read: (cookie: string) => Promise<T>,
): Promise<T> {
  try {
    return await read(access.cookie);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(`/login?redirect=${encodeURIComponent(access.returnPath)}`);
    }
    if (error instanceof ApiError && error.status === 403) {
      redirect("/dashboard");
    }
    throw error;
  }
}

function validatedAdminReturnPath(rawPath: string | null): string {
  if (!rawPath) {
    return ADMIN_FALLBACK_PATH;
  }

  try {
    const parsed = new URL(rawPath, VALIDATION_ORIGIN);
    const exactPath = `${parsed.pathname}${parsed.search}`;
    const isAdminPath = parsed.pathname === "/admin" || parsed.pathname.startsWith("/admin/");
    return parsed.origin === VALIDATION_ORIGIN && isAdminPath && exactPath === rawPath
      ? rawPath
      : ADMIN_FALLBACK_PATH;
  } catch {
    return ADMIN_FALLBACK_PATH;
  }
}
