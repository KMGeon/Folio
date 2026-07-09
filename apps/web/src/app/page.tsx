import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { DashboardBoard, type DashboardBoardLabels } from "@/components/dashboard/dashboard-board";
import { ApiError } from "@/lib/api-client";
import { getMe } from "@/lib/auth";
import { type DashboardPayload, fetchDashboard } from "@/lib/dashboard-api";

// Live dashboard: open and recently completed PRs from installed repos.
export const dynamic = "force-dynamic";

const dashboardBoardLabels: DashboardBoardLabels = {
  ready: "Ready to review",
  yours: "Your pull requests",
  other: "Other",
  completed: "Recently completed",
};

export default async function DashboardPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  let data: DashboardPayload;
  try {
    data = await fetchDashboard({ cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login?redirect=/");
    }
    throw err;
  }

  const user = await getMe(cookieHeader);
  const userLogin = user?.login;
  const yourPulls = userLogin ? data.pulls.filter((pull) => pull.author === userLogin) : [];
  const readyPulls = data.pulls.filter(
    (pull) => pull.author !== userLogin && pull.status === "ready",
  );
  const otherPulls = data.pulls.filter(
    (pull) => pull.author !== userLogin && pull.status !== "ready",
  );

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-7 p-4 md:p-6">
          <header className="pt-6">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Welcome back, {user?.login ?? "reviewer"}
            </h1>
          </header>

          <DashboardBoard
            readyPulls={readyPulls}
            yourPulls={yourPulls}
            otherPulls={otherPulls}
            completedPulls={data.completedPulls}
            labels={dashboardBoardLabels}
          />
        </div>
      </div>
    </AppLayout>
  );
}
