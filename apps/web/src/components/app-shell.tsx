import { BookOpen, GitPullRequest, PlugZap, Search, Settings, SquareStack } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PR } from "@/lib/sample-review";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "대시보드", icon: SquareStack },
  {
    href: `/${PR.org}/${PR.repo}/pull/${PR.number}/chapters/2`,
    label: "PR 리뷰",
    icon: GitPullRequest,
  },
  { href: "/onboarding/install", label: "설치", icon: PlugZap },
  { href: "/settings", label: "설정", icon: Settings },
];

function BrandMark() {
  return (
    <div className="flex size-7 items-center justify-center rounded-md border bg-primary/10 text-primary">
      <BookOpen className="size-4" />
    </div>
  );
}

export function AppShell({
  children,
  active = "대시보드",
}: {
  children: React.ReactNode;
  active?: string;
}) {
  return (
    <div className="flex min-h-svh bg-background text-foreground">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar/80 lg:flex lg:flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <BrandMark />
          <div>
            <div className="text-sm font-semibold">Folio</div>
            <div className="text-xs text-muted-foreground">Chapter review</div>
          </div>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
            <input
              className="h-8 w-full rounded-md border bg-background/40 pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
              placeholder="PR, repo 검색"
            />
          </div>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                "flex h-9 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active === label && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t p-3">
          <div className="rounded-md border bg-background/35 p-3">
            <div className="text-xs font-medium">GitHub App</div>
            <div className="mt-1 text-xs text-muted-foreground">Folio GitHub App 연결됨</div>
            <Button size="xs" variant="outline" className="mt-3 w-full">
              관리
            </Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
