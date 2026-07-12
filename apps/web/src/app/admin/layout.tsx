import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { AppLayout } from "@/components/app-layout";
import { getMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = (await cookies())
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const rawPath = (await headers()).get("x-folio-request-path");
  // Middleware owns this header; constrain it again before using it as a login return path.
  const returnPath = rawPath?.startsWith("/admin") ? rawPath : "/admin/overview";
  const user = await getMe(cookieHeader);
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(returnPath)}`);
  }
  if (!user.isSystemAdmin) {
    redirect("/dashboard");
  }
  return (
    <AppLayout user={user}>
      <AdminShell>{children}</AdminShell>
    </AppLayout>
  );
}
