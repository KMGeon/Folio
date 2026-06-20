import { BookOpen, Github, ShieldCheck } from "lucide-react";

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

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_minmax(0,460px)]">
      <ChapterSpine />
      <AuthPanel />
    </main>
  );
}

/** Signature: a sample PR decomposed into an ordered chapter table-of-contents. */
function ChapterSpine() {
  const totalAdd = SAMPLE_CHAPTERS.reduce((n, c) => n + c.add, 0);
  const totalDel = SAMPLE_CHAPTERS.reduce((n, c) => n + c.del, 0);

  return (
    <section className="relative hidden overflow-hidden border-r bg-sidebar/40 lg:block">
      {/* lone aesthetic risk: one faint green light source, kept low and off-center */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60% 55% at 22% 12%, color-mix(in oklab, var(--primary) 13%, transparent), transparent 72%)",
        }}
      />
      <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md border bg-primary/10 text-primary">
            <BookOpen className="size-4" />
          </div>
          <span className="font-semibold text-sm">Folio</span>
        </div>

        <div className="max-w-md">
          <p className="font-mono text-muted-foreground text-xs tracking-widest">
            PULL REQUEST&nbsp;&nbsp;#1284
          </p>
          <h1 className="mt-4 font-semibold text-3xl leading-tight tracking-tight xl:text-[2.5rem]">
            하나의 PR을,
            <br />
            순서가 있는 <span className="text-primary">리뷰 챕터</span>로.
          </h1>
          <p className="mt-3 text-muted-foreground text-sm">
            거대한 diff를 위에서 아래로 훑는 대신, 논리 단위로 나뉜 챕터를 순서대로 읽습니다.
          </p>

          <ol className="mt-8 space-y-px">
            {SAMPLE_CHAPTERS.map((c, i) => (
              <ChapterRow key={c.title} index={i + 1} {...c} />
            ))}
          </ol>

          <div className="mt-5 flex items-center gap-4 border-t pt-4 font-mono text-xs">
            <span className="text-muted-foreground">
              {SAMPLE_CHAPTERS.length} chapters · ~9 min read
            </span>
            <span className="ml-auto text-diff-add-fg">+{totalAdd}</span>
            <span className="text-diff-del-fg">−{totalDel}</span>
          </div>
        </div>

        <p className="font-mono text-muted-foreground/70 text-xs">
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
          risk === "low" ? "bg-primary" : "bg-syntax-code",
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

function AuthPanel() {
  return (
    <section className="flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-sm">
        {/* brand shown here too — left spine is hidden on small screens */}
        <div className="flex items-center gap-3 lg:hidden">
          <div className="flex size-8 items-center justify-center rounded-md border bg-primary/10 text-primary">
            <BookOpen className="size-4" />
          </div>
          <span className="font-semibold text-sm">Folio</span>
        </div>

        <div className="mt-8 lg:mt-0">
          <p className="font-mono text-muted-foreground text-xs tracking-widest">로그인</p>
          <h2 className="mt-2 font-semibold text-2xl tracking-tight">다시 오신 걸 환영합니다</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            GitHub 계정으로 계속하면 viewed/progress가 기기 간에 이어집니다.
          </p>
        </div>

        <Button asChild size="lg" className="mt-8 w-full">
          <a href={loginUrl("/")}>
            <Github className="size-4" />
            GitHub로 계속하기
          </a>
        </Button>

        <div className="mt-3 flex items-start gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary" />
          <span>
            OAuth는 사용자 식별과 진행 상태 저장에만 쓰입니다. Repository 접근은 GitHub App
            installation 권한으로 분리됩니다.
          </span>
        </div>

        <p className="mt-10 text-center font-mono text-muted-foreground/60 text-xs">
          계속하면 Folio 약관 및 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </div>
    </section>
  );
}
