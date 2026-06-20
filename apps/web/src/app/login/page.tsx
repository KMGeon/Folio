import { GitPullRequest, Github, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <main className="grid min-h-svh place-items-center p-6">
      <section className="w-full max-w-md rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <GitPullRequest className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Folio에 로그인</h1>
            <p className="text-sm text-muted-foreground">GitHub PR을 챕터로 읽습니다.</p>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>OAuth는 사용자를 식별하고 viewed/progress 상태를 저장하는 데 사용됩니다.</span>
          </div>
          <div className="flex gap-2">
            <Github className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>Repository 접근은 GitHub App installation 권한으로 처리됩니다.</span>
          </div>
        </div>

        <Button asChild className="mt-6 w-full">
          <Link href="/">
            <Github className="size-4" />
            GitHub로 계속하기
          </Link>
        </Button>
        <Button asChild variant="ghost" className="mt-2 w-full">
          <Link href="/">mock dashboard 보기</Link>
        </Button>
      </section>
    </main>
  );
}
