import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { DashboardBoardClient } from "@/components/dashboard/dashboard-board-client";
import { type DashboardBoardLabels } from "@/components/dashboard/dashboard-board";
import { getMe } from "@/lib/auth";

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

  const user = await getMe(cookieHeader);
  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-8 md:px-6">
          {/* Editorial masthead: eyebrow → serif headline → standfirst, ruled off. */}
          <header className="space-y-3 border-b pt-10 pb-7">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
              리뷰 데스크
            </p>
            <h1 className="font-sans text-2xl font-medium leading-[1.1] tracking-tight md:text-3xl">
              Welcome back, <span className="italic">{user?.login ?? "reviewer"}</span>
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              풀리퀘스트를 챕터 순서로 읽어 내려가며 리뷰하세요. 아래는 오늘의 읽을거리입니다.
            </p>
          </header>

          <div className="pt-8">
            <DashboardBoardClient labels={dashboardBoardLabels} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
