import { Github, KeyRound, Link2, Server } from "lucide-react";
import { cookies } from "next/headers";

import { AppLayout } from "@/components/app-layout";
import { Button } from "@/components/ui/button";
import { getMe } from "@/lib/auth";
import { webEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const user = await getMe(cookieHeader);

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
        </div>
      </div>
    </AppLayout>
  );
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
