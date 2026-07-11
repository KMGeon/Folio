import { ArrowUpRight, Github, PlugZap } from "lucide-react";
import { cookies } from "next/headers";

import { AppLayout } from "@/components/app-layout";
import { ClaimWorkspaceButton } from "@/components/claim-workspace-button";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/auth";

export const dynamic = "force-dynamic";

const permissions = [
  { label: "Contents", value: "Read", note: "PR diff와 파일 내용을 읽습니다" },
  { label: "Pull requests", value: "Read & write", note: "리뷰 comment를 남깁니다" },
  { label: "Checks", value: "Read & write", note: "Check Run을 생성합니다" },
  { label: "Metadata", value: "Read", note: "저장소 기본 정보를 읽습니다" },
];

const flowSteps = [
  "Repo 선택",
  "Webhook delivery 수신",
  "PR diff fetch",
  "Codex file-level chaptering",
  "Open in Folio comment 작성",
];

export default async function InstallPage({
  searchParams,
}: {
  searchParams: Promise<{ installation_id?: string | string[] }>;
}) {
  const { installation_id: rawInstallationId } = await searchParams;
  const installationId = parseInstallationId(rawInstallationId);
  const appSlug = process.env.GITHUB_APP_SLUG ?? process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
  const installationUrl = appSlug ? `https://github.com/apps/${appSlug}/installations/new` : null;
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const user = await getMe(cookieHeader);

  return (
    <AppLayout user={user}>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-4 pb-10 md:px-6">
          {/* Editorial masthead: mono eyebrow → serif headline → standfirst, ruled off. */}
          <header className="space-y-3 border-b pt-10 pb-7">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-muted-foreground">
              온보딩 · 설치
            </p>
            <h1 className="font-sans text-2xl font-medium leading-[1.1] tracking-tight md:text-3xl">
              GitHub App 설치
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
              Folio가 PR diff를 읽고 Check Run과 리뷰 comment를 남기려면 저장소에 GitHub App을
              설치하세요.
            </p>
          </header>

          <div className="grid gap-x-12 gap-y-12 pt-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="min-w-0">
              <div className="flex items-start gap-4">
                {/* Hairline chip, primary icon: green reads as the connect/ready accent. */}
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border text-primary">
                  <PlugZap className="size-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-sans text-xl font-medium tracking-tight">Folio GitHub App</h2>
                  <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                    설치하면 PR open·synchronize webhook이 들어오고, backend worker가 곧바로 리뷰
                    챕터를 만듭니다.
                  </p>
                </div>
              </div>

              <div className="mt-10">
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                  요청 권한
                </p>
                <ul className="mt-4 border-t">
                  {permissions.map((permission) => (
                    <li
                      key={permission.label}
                      className="flex items-baseline justify-between gap-4 border-b py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm">{permission.label}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{permission.note}</p>
                      </div>
                      <span className="shrink-0 font-mono text-xs tracking-tight text-muted-foreground">
                        {permission.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {installationId ? (
                <ClaimWorkspaceButton installationId={installationId} />
              ) : installationUrl ? (
                <Button className="mt-8" asChild>
                  <a href={installationUrl}>
                    <Github className="size-4" />
                    GitHub에서 설치
                    <ArrowUpRight className="size-4" />
                  </a>
                </Button>
              ) : (
                <Button className="mt-8" disabled>
                  GitHub App 설정 필요
                </Button>
              )}
            </section>

            <aside className="min-w-0">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                설치 후 흐름
              </p>
              {/* Real ordered pipeline → mono numerals justify the numbering. */}
              <ol className="mt-4 border-t">
                {flowSteps.map((step, index) => (
                  <li key={step} className="flex items-baseline gap-4 border-b py-3">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function parseInstallationId(value: string | string[] | undefined): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const installationId = Number(value);
  return Number.isSafeInteger(installationId) ? installationId : null;
}
