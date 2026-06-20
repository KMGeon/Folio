import { ArrowUpRight, CheckCircle2, Github, PlugZap } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export default function InstallPage() {
  return (
    <AppShell active="설치">
      <div className="flex min-h-svh flex-col">
        <header className="border-b px-6 py-5">
          <h1 className="text-base font-semibold">GitHub App 설치</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Folio가 PR diff를 읽고 Check Run과 bot comment를 작성하려면 repo installation이
            필요합니다.
          </p>
        </header>
        <div className="grid gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <PlugZap className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Folio GitHub App</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  설치 후 webhook으로 PR open/synchronize 이벤트가 들어오고, backend worker가 챕터를
                  생성합니다.
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Permission label="Contents" value="Read" />
              <Permission label="Pull requests" value="Read & write" />
              <Permission label="Checks" value="Read & write" />
              <Permission label="Metadata" value="Read" />
            </div>
            <Button className="mt-5">
              <Github className="size-4" />
              GitHub에서 설치
              <ArrowUpRight className="size-4" />
            </Button>
          </section>
          <aside className="rounded-lg border bg-card p-5">
            <h2 className="text-sm font-semibold">설치 후 흐름</h2>
            <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
              {[
                "Repo 선택",
                "Webhook delivery 수신",
                "PR diff fetch",
                "Codex file-level chaptering",
                "Open in Folio comment 작성",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function Permission({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/35 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
