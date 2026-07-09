import { Link2, Search } from "lucide-react";
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
        <div className="mx-auto w-full max-w-3xl px-4 pb-16 md:px-8">
          {/* Editorial masthead: eyebrow → serif headline → standfirst, ruled off. */}
          <header className="space-y-3 border-b pt-10 pb-7">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
              Settings
            </p>
            <h1 className="font-serif text-3xl font-normal leading-[1.1] tracking-tight md:text-[2.75rem]">
              <span className="italic">워크스페이스</span> 설정
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              계정, GitHub App, 개발 환경, 저장소 연결을 한자리에서 관리하세요.
            </p>
          </header>

          <div className="space-y-12 pt-10">
            <SettingsSection title="계정" meta="Account">
              <dl className="divide-y divide-border">
                <Row label="GitHub user" value={<span className="font-mono">KMGeon</span>} />
                <Row label="Session" value="mock session" />
              </dl>
              <Button size="sm" variant="outline" className="mt-5">
                로그아웃
              </Button>
            </SettingsSection>

            <SettingsSection title="GitHub App" meta="App">
              <dl className="divide-y divide-border">
                <Row label="App" value="Folio GitHub App" />
                <Row label="Webhook" value={<StatusValue label="active" />} />
                <Row label="Installations" value="2 accounts" />
              </dl>
              <Button size="sm" className="mt-5">
                설치 관리
              </Button>
            </SettingsSection>

            <SettingsSection title="개발 환경" meta="Environment">
              <dl className="divide-y divide-border">
                <Row label="Profile" value={<span className="font-mono">{webEnv.profile}</span>} />
                <Row
                  label="Backend"
                  value={<span className="font-mono">http://localhost:8080</span>}
                />
                <Row label="Webhook URL" value="loca.lt tunnel" />
                <Row
                  label="Renderer"
                  value={<span className="font-mono">http://localhost:5173</span>}
                />
              </dl>
              <Button size="sm" variant="outline" className="mt-5">
                <Link2 className="size-4" />
                상태 확인
              </Button>
            </SettingsSection>

            <SettingsSection
              title="저장소"
              meta={
                <>
                  <span className="text-foreground/80">{activeRepos.length}</span> 활성 ·{" "}
                  <span className="text-foreground/80">{inactiveRepos.length}</span> 대기
                </>
              }
            >
              <form method="get" className="flex flex-col gap-2 sm:flex-row">
                <label className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    name="repo"
                    defaultValue={repoParam ?? ""}
                    aria-label="저장소 검색"
                    placeholder="저장소 검색"
                    className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  />
                </label>
                <select
                  name="state"
                  defaultValue={repoState}
                  aria-label="저장소 상태"
                  className="h-9 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-32"
                >
                  <option value="all">전체</option>
                  <option value="enabled">활성</option>
                  <option value="disabled">비활성</option>
                </select>
                <Button size="sm" variant="outline" className="h-9">
                  필터
                </Button>
              </form>
              <div className="mt-4 max-h-[28rem] overflow-y-auto pr-1">
                {visibleRepos.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {visibleRepos.map((repo) => (
                      <li key={repo.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground/90">
                            {repo.fullName}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[0.7rem] tracking-wide text-muted-foreground">
                            {repo.private ? "비공개" : "공개"} · {repo.defaultBranch}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <RepositoryToggleForm
                            repositoryId={repo.id}
                            repositoryName={repo.fullName}
                            enabled={repo.folioEnabled}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-md border border-dashed bg-background/35 px-3 py-8 text-center text-xs text-muted-foreground">
                    조건에 맞는 저장소가 없습니다.
                  </div>
                )}
              </div>
            </SettingsSection>

            {user?.login === "KMGeon" ? (
              <SettingsSection title="가입 요청" meta={`${pendingUsers.length} 건`}>
                <PendingUsersAdmin initialUsers={pendingUsers} />
              </SettingsSection>
            ) : null}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function SettingsSection({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <h2 className="font-serif text-lg italic leading-none text-foreground/90">{title}</h2>
        {meta ? (
          <span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.15em] tabular-nums text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-foreground/90">
        {value}
      </dd>
    </div>
  );
}

// Vivid semantic accent: a healthy status reads green (state = color).
function StatusValue({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-primary">
      <span className="size-1.5 rounded-full bg-primary" />
      {label}
    </span>
  );
}
