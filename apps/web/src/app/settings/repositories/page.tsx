import { BookOpen, Search } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { RepositoryToggleForm } from "@/components/repository-toggle-form";
import { SettingsCard, SettingsPageHeader } from "@/components/settings/settings-card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { type RepositoryListPayload, fetchRepositories } from "@/lib/repositories-api";
import { getWorkspaceContext, repositoryActivationReason } from "@/lib/workspace-permission";

export default async function RepositoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string | string[]; state?: string | string[] }>;
}) {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const params = await searchParams;
  const repoParam = firstSearchParam(params.repo);
  const stateParam = firstSearchParam(params.state);
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
  const query = repoParam?.trim().toLowerCase() ?? "";
  const state = stateParam === "enabled" || stateParam === "disabled" ? stateParam : "all";
  const visible = payload.repositories.filter((repository) => {
    const matchesQuery = !query || repository.fullName.toLowerCase().includes(query);
    const matchesState =
      state === "all" ||
      (state === "enabled" && repository.folioEnabled) ||
      (state === "disabled" && !repository.folioEnabled);
    return matchesQuery && matchesState;
  });
  const enabledCount = payload.repositories.filter((repository) => repository.folioEnabled).length;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <SettingsPageHeader
        title="Repositories"
        description="Folio가 리뷰할 GitHub 저장소를 선택합니다."
      />
      <SettingsCard
        title="Connected repositories"
        description={`${enabledCount}개 활성 · ${payload.repositories.length}개 연결됨`}
        icon={<BookOpen className="size-4" />}
      >
        <form method="get" className="flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              name="repo"
              defaultValue={repoParam ?? ""}
              aria-label="저장소 검색"
              placeholder="저장소 검색"
              className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none focus-visible:border-ring"
            />
          </label>
          <select
            name="state"
            defaultValue={state}
            aria-label="저장소 상태"
            className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:border-ring sm:w-28"
          >
            <option value="all">전체</option>
            <option value="enabled">활성</option>
            <option value="disabled">비활성</option>
          </select>
          <Button size="sm" variant="outline">
            필터
          </Button>
        </form>
        <div className="mt-4 max-h-[32rem] overflow-y-auto">
          {visible.length ? (
            <ul className="divide-y">
              {visible.map((repository) => (
                <li key={repository.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{repository.fullName}</div>
                    <div className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground">
                      {repository.private ? "비공개" : "공개"} · {repository.defaultBranch}
                    </div>
                  </div>
                  <RepositoryToggleForm
                    repositoryId={repository.id}
                    repositoryName={repository.fullName}
                    enabled={repository.folioEnabled}
                    disabledReason={disabledReason}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
              조건에 맞는 저장소가 없습니다.
            </div>
          )}
        </div>
      </SettingsCard>
    </div>
  );
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
