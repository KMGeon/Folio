import { Github, Settings2, Users } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { WorkspaceMembersAdmin } from "@/components/settings/workspace-members-admin";
import { Button } from "@/components/ui/button";
import { getMe, installationUrl, listWorkspaceMembers } from "@/lib/auth";
import { canManageMembers, getWorkspaceContext } from "@/lib/workspace-permission";

export default async function WorkspacesPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const user = await getMe(cookieHeader);
  if (!user) {
    redirect("/login?redirect=/settings/workspaces");
  }
  const workspaceContext = await getWorkspaceContext(cookieHeader);
  // Visibility avoids unauthorized data requests; backend authorization remains authoritative.
  const members =
    workspaceContext?.workspace && canManageMembers(workspaceContext)
      ? await listWorkspaceMembers(workspaceContext.workspace.id, cookieHeader)
      : null;
  return (
    <div className="mx-auto w-full max-w-4xl">
      <SettingsPageHeader
        title="Workspaces"
        description="GitHub 설치와 Folio 워크스페이스를 관리합니다."
      />
      <div className="space-y-4">
        <SettingsCard
          title="Current workspace"
          description="현재 선택한 GitHub 워크스페이스"
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
            <span className="font-medium">
              {workspaceContext?.workspace?.accountLogin ?? user.login}
            </span>
          </div>
        </SettingsCard>
        {members && workspaceContext ? (
          <SettingsCard
            title="Workspace members"
            description="워크스페이스 멤버의 역할과 상태를 관리합니다."
            icon={<Users className="size-4" />}
          >
            <WorkspaceMembersAdmin initialMembers={members} workspaceContext={workspaceContext} />
          </SettingsCard>
        ) : null}
        <SettingsCard
          title="Install the GitHub App"
          description="다른 GitHub 계정이나 조직에 Folio를 설치합니다."
          icon={<Github className="size-4" />}
        >
          <Button asChild>
            <a href={installationUrl()}>GitHub App 설치</a>
          </Button>
        </SettingsCard>
      </div>
    </div>
  );
}
