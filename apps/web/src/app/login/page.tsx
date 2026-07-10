import { Clock3, Github, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ChapterSceneBackground } from "@/components/three/chapter-scene-background";
import { Button } from "@/components/ui/button";
import { loginUrl } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Risk = "low" | "medium";

const SAMPLE_CHAPTERS: { title: string; scope: string; add: number; del: number; risk: Risk }[] = [
  { title: "세션 스키마 & repo 토큰", scope: "db, migrations", add: 142, del: 8, risk: "low" },
  {
    title: "GitHub OAuth 어댑터",
    scope: "infrastructure/github",
    add: 96,
    del: 21,
    risk: "medium",
  },
  { title: "세션 도메인 서비스", scope: "domain/auth", add: 73, del: 4, risk: "low" },
  {
    title: "Facade & 라우트 가드",
    scope: "interfaces/api/auth",
    add: 118,
    del: 33,
    risk: "medium",
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string | string[]; status?: string | string[] }>;
}) {
  const { redirect, status } = await searchParams;
  // Only honor a single in-app path; backend safeRedirectPath rejects anything else.
  const redirectPath =
    typeof redirect === "string" && redirect.startsWith("/") ? redirect : "/dashboard";
  const isPending = status === "pending";
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_minmax(0,460px)]">
      <ChapterSpine />
      <AuthPanel redirectPath={redirectPath} isPending={isPending} />
    </main>
  );
}

/** Signature: a live 3D stack of chapter slabs behind the table-of-contents. */
function ChapterSpine() {
  const totalAdd = SAMPLE_CHAPTERS.reduce((n, c) => n + c.add, 0);
  const totalDel = SAMPLE_CHAPTERS.reduce((n, c) => n + c.del, 0);

  return (
    <section className="relative hidden overflow-hidden border-r bg-sidebar/40 lg:block">
      {/* signature: live 3D chapter slabs drift behind the table-of-contents */}
      <ChapterSceneBackground />
      {/* scrim darkens the lower-left so the copy + TOC stay readable over the scene */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-background via-background/55 to-transparent"
      />

      <div className="relative flex h-full flex-col p-12 xl:p-16">
        {/* editorial masthead: real brand mark + serif italic wordmark */}
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="font-serif text-xl italic leading-none">Folio</span>
        </div>

        <div className="flex flex-1 flex-col justify-center">
          <div className="max-w-md">
            <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
              Pull Request&nbsp;·&nbsp;#1284
            </p>
            <h1 className="mt-4 font-serif text-3xl font-normal leading-[1.08] tracking-tight xl:text-4xl">
              이제 중요한 건 코드가 아니라
              <br />
              <span className="italic">리뷰</span>입니다.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
              AI가 코드를 쏟아내는 시대, 진짜 병목은 검토입니다. Folio는 하나의 PR을 순서가 있는
              리뷰 챕터로 나눠 한 편의 코덱스처럼 읽어 내려가게 합니다.
            </p>

            <div className="mt-9">
              <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
                Table of Contents
              </p>
              <ol className="mt-3 space-y-px">
                {SAMPLE_CHAPTERS.map((c, i) => (
                  <ChapterRow key={c.title} index={i + 1} {...c} />
                ))}
              </ol>
            </div>

            <div className="mt-5 flex items-center gap-4 border-t pt-4 font-mono text-xs">
              <span className="text-muted-foreground">
                {SAMPLE_CHAPTERS.length} chapters · ~9 min read
              </span>
              <span className="ml-auto text-diff-add-fg">+{totalAdd}</span>
              <span className="text-diff-del-fg">−{totalDel}</span>
            </div>
          </div>
        </div>

        <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground/70">
          GitHub-native PR review · chapter by chapter
        </p>
      </div>
    </section>
  );
}

function ChapterRow({
  index,
  title,
  scope,
  add,
  del,
  risk,
}: {
  index: number;
  title: string;
  scope: string;
  add: number;
  del: number;
  risk: Risk;
}) {
  return (
    <li className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent/60">
      <span className="w-5 shrink-0 font-mono text-muted-foreground/60 text-xs tabular-nums">
        {String(index).padStart(2, "0")}
      </span>
      <span
        aria-hidden
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          risk === "low" ? "bg-primary" : "bg-warning",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{title}</div>
        <div className="truncate font-mono text-muted-foreground text-xs">{scope}</div>
      </div>
      <div className="shrink-0 font-mono text-xs tabular-nums">
        <span className="text-diff-add-fg">+{add}</span>{" "}
        <span className="text-diff-del-fg">−{del}</span>
      </div>
    </li>
  );
}

function AuthPanel({ redirectPath, isPending }: { redirectPath: string; isPending: boolean }) {
  return (
    <section className="flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-sm">
        {/* brand shown here too — the 3D spine is hidden on small screens */}
        <div className="flex items-center gap-2.5 lg:hidden">
          <BrandMark />
          <span className="font-serif text-xl italic leading-none">Folio</span>
        </div>

        <div className="mt-10 lg:mt-0">
          <p className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted-foreground">
            로그인
          </p>
          <h2 className="mt-2.5 font-serif text-2xl font-normal leading-[1.1] tracking-tight">
            <span className="italic">Folio</span> 시작하기
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            GitHub 계정으로 로그인하면 리뷰 진행 상황이 모든 기기에서 그대로 이어집니다.
          </p>
        </div>

        {isPending ? (
          <div className="mt-6 flex items-start gap-3 rounded-md border bg-card p-3.5 text-sm">
            <Clock3 className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">승인 대기 중입니다.</p>
              <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                관리자 승인 후 Folio를 사용할 수 있습니다. 승인이 완료되면 다시 GitHub로 로그인해
                주세요.
              </p>
            </div>
          </div>
        ) : null}

        <Button asChild size="lg" className="mt-8 w-full">
          <a href={loginUrl(redirectPath)}>
            <Github className="size-4" />
            GitHub로 계속하기
          </a>
        </Button>

        <div className="mt-3 flex items-start gap-2 text-muted-foreground text-xs leading-relaxed">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
          <span>
            Folio는 코드를 저장하지 않습니다. 저장소 접근 권한은 필요한 범위에서만 안전하게
            관리됩니다.
          </span>
        </div>

        <p className="mt-10 border-t pt-6 text-center text-muted-foreground/60 text-xs leading-relaxed">
          계속하면 Folio{" "}
          <a href="/terms" className="underline underline-offset-2 hover:text-foreground">
            이용약관
          </a>{" "}
          및{" "}
          <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            개인정보 처리방침
          </a>
          에 동의하게 됩니다.
        </p>
      </div>
    </section>
  );
}
