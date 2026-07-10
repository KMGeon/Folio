import { Github, Settings2 } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/auth";

export default async function WorkspacesPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const user = await getMe(cookieHeader);
  if (!user) {
    redirect("/login?redirect=/settings/workspaces");
  }
  return (
    <div className="mx-auto w-full max-w-2xl">
      <SettingsPageHeader
        title="Workspaces"
        description="GitHub 설치와 Folio 워크스페이스를 관리합니다."
      />
      <div className="space-y-4">
        <SettingsCard
          title="Your workspace"
          description="현재 로그인한 GitHub 워크스페이스"
          icon={<Settings2 className="size-4" />}
        >
          <div className="flex h-12 items-center gap-3 rounded-md border bg-background/35 px-3">
            <img
              src={user.avatarUrl}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-full"
            />
            <span className="font-medium">{user.login}</span>
          </div>
        </SettingsCard>
        <SettingsCard
          title="Install the GitHub App"
          description="다른 GitHub 계정이나 조직에 Folio를 설치합니다."
          icon={<Github className="size-4" />}
        >
          <Button asChild>
            <Link href="/onboarding/install">GitHub App 설치</Link>
          </Button>
        </SettingsCard>
      </div>
    </div>
  );
}
