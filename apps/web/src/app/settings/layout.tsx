import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { SettingsShell } from "@/components/settings/settings-shell";
import { getMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieHeader = (await cookies())
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  const user = await getMe(cookieHeader);
  if (!user) {
    redirect("/login?redirect=/settings/preferences");
  }
  return (
    <AppLayout user={user}>
      <SettingsShell user={user}>{children}</SettingsShell>
    </AppLayout>
  );
}
