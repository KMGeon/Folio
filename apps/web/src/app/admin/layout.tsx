import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { AppLayout } from "@/components/app-layout";
import { getMe } from "@/lib/auth";
import { getAdminServerAccess } from "./admin-server-access";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminServerAccess();
  const user = await getMe(access.cookie);
  if (!user) {
    redirect(`/login?redirect=${encodeURIComponent(access.returnPath)}`);
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
