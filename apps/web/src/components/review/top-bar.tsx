import { LayoutDashboard, MessageSquarePlus, Moon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { logoutUrl } from "@/lib/auth";
import type { ReviewPrMeta } from "@/lib/review-api";

function BrandMark() {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="block h-[2px] w-4 rounded-full bg-foreground/80" />
      <span className="block h-[2px] w-4 rounded-full bg-foreground/50" />
      <span className="block h-[2px] w-4 rounded-full bg-foreground/30" />
    </div>
  );
}

function Crumb({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="rounded px-1 py-0.5 text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
    >
      {label}
    </button>
  );
}

export function TopBar({ pr }: { pr: ReviewPrMeta }) {
  return (
    <header className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b px-4 py-2">
      <nav className="flex min-w-0 items-center gap-1.5 text-sm">
        <span className="mr-1.5 flex size-6 items-center justify-center">
          <BrandMark />
        </span>
        <span className="hidden items-center gap-1.5 sm:flex">
          <Crumb label={pr.org} />
          <span className="text-muted-foreground/50">/</span>
          <Crumb label={pr.repo} />
          <span className="text-muted-foreground/50">/</span>
        </span>
        <span className="px-1 font-medium">#{pr.number}</span>
      </nav>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="xs" variant="ghost" className="hidden text-muted-foreground sm:inline-flex">
          <MessageSquarePlus className="size-4" />
          피드백
        </Button>
        <Button
          asChild
          size="xs"
          variant="ghost"
          className="hidden text-muted-foreground sm:inline-flex"
        >
          <Link href="/">
            <LayoutDashboard className="size-4" />
            대시보드
          </Link>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground"
          aria-label="테마 전환"
        >
          <Moon className="size-4" />
        </Button>
        <button
          type="button"
          onClick={async () => {
            await fetch(logoutUrl(), { method: "POST", credentials: "include" });
            window.location.href = "/login";
          }}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
