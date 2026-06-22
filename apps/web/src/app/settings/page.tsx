import { Github, KeyRound, Link2, Search, Server, UserCheck } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppLayout } from "@/components/app-layout";
import { PendingUsersAdmin } from "@/components/pending-users-admin";
import { RepositoryToggleForm } from "@/components/repository-toggle-form";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { getMe, getPendingUsers } from "@/lib/auth";
import { webEnv } from "@/lib/env";
import { type RepositoryListPayload, fetchRepositories } from "@/lib/repositories-api";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string | string[]; state?: string | string[] }>;
}) {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const user = await getMe(cookieHeader);
  const pendingUsers = user?.login === "KMGeon" ? await getPendingUsers(cookieHeader) : [];
  const params = await searchParams;
  const repoParam = firstSearchParam(params.repo);
  const stateParam = firstSearchParam(params.state);
  let repositoryPayload: RepositoryListPayload;
  try {
    repositoryPayload = await fetchRepositories({ cookie: cookieHeader });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login?redirect=/settings");
    }
    throw err;
  }
  const repoQuery = repoParam?.trim().toLowerCase() ?? "";
  const repoState = stateParam === "enabled" || stateParam === "disabled" ? stateParam : "all";
  const activeRepos = repositoryPayload.repositories.filter((repo) => repo.folioEnabled);
  const inactiveRepos = repositoryPayload.repositories.filter((repo) => !repo.folioEnabled);
  const visibleRepos = repositoryPayload.repositories.filter((repo) => {
    const matchesQuery = repoQuery.length === 0 || repo.fullName.toLowerCase().includes(repoQuery);
    const matchesState =
      repoState === "all" ||
      (repoState === "enabled" && repo.folioEnabled) ||
      (repoState === "disabled" && !repo.folioEnabled);
    return matchesQuery && matchesState;
  });

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <header className="border-b px-6 py-5">
          <h1 className="text-base font-semibold">설정</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            계정, GitHub App, 개발 tunnel 상태를 관리합니다.
          </p>
        </header>
        <div className="grid gap-4 p-6 xl:grid-cols-3">
          <SettingsSection icon={Github} title="Account">
            <Row label="GitHub user" value="KMGeon" />
            <Row label="Session" value="mock session" />
            <Button size="sm" variant="outline" className="mt-4">
              로그아웃
            </Button>
          </SettingsSection>
          <SettingsSection icon={KeyRound} title="GitHub App">
            <Row label="App" value="Folio GitHub App" />
            <Row label="Webhook" value="active" />
            <Row label="Installations" value="2 accounts" />
            <Button size="sm" className="mt-4">
              설치 관리
            </Button>
          </SettingsSection>
          <SettingsSection icon={Server} title="Developer">
            <Row label="Profile" value={webEnv.profile} />
            <Row label="Backend" value="http://localhost:8080" />
            <Row label="Webhook URL" value="loca.lt tunnel" />
            <Row label="Renderer" value="http://localhost:5173" />
            <Button size="sm" variant="outline" className="mt-4">
              <Link2 className="size-4" />
              상태 확인
            </Button>
          </SettingsSection>
          <SettingsSection icon={Github} title="Repositories">
            <div className="grid gap-2 text-sm">
              <Row label="Active" value={String(activeRepos.length)} />
              <Row label="Inactive" value={String(inactiveRepos.length)} />
            </div>
            <form method="get" className="mt-4 grid gap-2 md:grid-cols-[1fr_9rem_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  name="repo"
                  defaultValue={repoParam ?? ""}
                  aria-label="Repository search"
                  placeholder="Repository search"
                  className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </label>
              <select
                name="state"
                defaultValue={repoState}
                aria-label="Repository state"
                className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="all">All</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
              <Button size="sm" variant="outline">
                Filter
              </Button>
            </form>
            <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {visibleRepos.length > 0 ? (
                visibleRepos.map((repo) => (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between gap-3 rounded-md border bg-background/35 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{repo.fullName}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {repo.private ? "private" : "public"} · {repo.defaultBranch}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <RepositoryToggleForm
                        repositoryId={repo.id}
                        repositoryName={repo.fullName}
                        enabled={repo.folioEnabled}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed bg-background/35 px-3 py-6 text-center text-xs text-muted-foreground">
                  조건에 맞는 repository가 없습니다.
                </div>
              )}
            </div>
          </SettingsSection>
          {user?.login === "KMGeon" ? (
            <SettingsSection icon={UserCheck} title="가입 요청">
              <PendingUsersAdmin initialUsers={pendingUsers} />
            </SettingsSection>
          ) : null}
        </div>
      </div>
    </AppLayout>
  );
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Github;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-background/35 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}
