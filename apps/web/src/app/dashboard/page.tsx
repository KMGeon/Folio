import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { DashboardBoardClient } from "@/components/dashboard/dashboard-board-client";
import { defaultDashboardLabels } from "@/components/dashboard/dashboard-board-config";
import { getMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const user = await getMe(cookieHeader);
  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 pt-8 pb-8 md:px-6">
          <DashboardBoardClient
            labels={defaultDashboardLabels}
            user={{ login: user.login, avatarUrl: user.avatarUrl }}
          />
        </div>
      </div>
    </AppLayout>
  );
}
