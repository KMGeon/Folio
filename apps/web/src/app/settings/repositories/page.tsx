import { ExternalLink, Github } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RepositorySettingsTable } from "@/components/settings/repository-settings-table";
import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { type RepositoryListPayload, fetchRepositories } from "@/lib/repositories-api";
import { getWorkspaceContext, repositoryActivationReason } from "@/lib/workspace-permission";

export default async function RepositoriesPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  let payload: RepositoryListPayload;
  const workspaceContext = await getWorkspaceContext(cookieHeader);

  try {
    payload = await fetchRepositories({ cookie: cookieHeader });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?redirect=/settings/repositories");
    }
    throw error;
  }

  // Repository authority comes from the backend workspace context, never browser GitHub state.
  const disabledReason = workspaceContext
    ? repositoryActivationReason(workspaceContext)
    : "워크스페이스 권한 정보를 불러올 수 없습니다.";
  const action =
    payload.githubInstallationId !== null ? (
      <Button asChild size="xs" variant="ghost">
        <a
          href={`https://github.com/settings/installations/${payload.githubInstallationId}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Manage on GitHub
          <ExternalLink aria-hidden="true" />
        </a>
      </Button>
    ) : (
      <span className="text-xs text-muted-foreground">GitHub App 설치를 연결해 주세요.</span>
    );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <SettingsPageHeader
        title="Repositories"
        description="Folio가 리뷰할 GitHub 저장소를 선택합니다."
      />
      <SettingsCard
        title="Repositories"
        description="연결된 GitHub 저장소별로 Folio 리뷰를 관리합니다."
        icon={<Github className="size-4" />}
        action={action}
      >
        <RepositorySettingsTable
          initialRepositories={payload.repositories}
          disabledReason={disabledReason}
        />
      </SettingsCard>
    </div>
  );
}
