"use client";

import { Github, PlugZap } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { installationUrl } from "@/lib/auth";
import type { WorkspaceContext } from "@/lib/workspace-permission";

interface InstallationOnboardingGateProps {
  onboardingState: WorkspaceContext["onboardingState"] | null;
}

const gateContent = {
  install_required: {
    title: "GitHub App 설치가 필요합니다",
    description: "Folio가 PR을 검토하려면 워크스페이스에 GitHub App을 설치해야 합니다.",
    action: "GitHub에서 설치",
  },
  reinstall_required: {
    title: "GitHub App을 다시 연결해야 합니다",
    description: "GitHub App 연결이 더 이상 유효하지 않습니다. 다시 설치해 연결을 복구하세요.",
    action: "GitHub에서 다시 연결",
  },
  membership_suspended: {
    title: "연결이 해제되었습니다",
    description: "이 워크스페이스의 멤버십이 중지되었습니다. 워크스페이스 관리자에게 문의하세요.",
    action: undefined,
  },
} as const;

export function InstallationOnboardingGate({ onboardingState }: InstallationOnboardingGateProps) {
  const pathname = usePathname();

  // Keep the setup and support routes available while product routes are blocked.
  if (
    onboardingState === null ||
    onboardingState === "ready" ||
    pathname === "/onboarding/install" ||
    pathname.startsWith("/admin")
  ) {
    return null;
  }

  const content = gateContent[onboardingState];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="installation-onboarding-title"
        className="w-full max-w-md border bg-card p-5"
      >
        <div className="flex size-9 items-center justify-center rounded-md border text-primary">
          <PlugZap className="size-4" />
        </div>
        <h2 id="installation-onboarding-title" className="mt-4 text-lg font-medium tracking-tight">
          {content.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{content.description}</p>
        {content.action ? (
          <Button className="mt-5" asChild>
            <a href={installationUrl()}>
              <Github className="size-4" />
              {content.action}
            </a>
          </Button>
        ) : null}
      </section>
    </div>
  );
}
