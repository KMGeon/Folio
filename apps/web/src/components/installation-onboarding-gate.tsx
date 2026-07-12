"use client";

import { Github, PlugZap } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { installationUrl } from "@/lib/auth";
import type { WorkspaceContext } from "@/lib/workspace-permission";

interface InstallationOnboardingGateProps {
  onboardingState: WorkspaceContext["onboardingState"] | null;
}

const FOCUSABLE_CONTROL_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const gateContent = {
  install_required: {
    title: "GitHub App 설치가 필요합니다",
    description: "Folio가 PR을 검토하려면 워크스페이스에 GitHub App을 설치해야 합니다.",
    action: "GitHub에서 설치",
  },
  reinstall_required: {
    title: "GitHub App을 다시 연결해야 합니다",
    description: "이 워크스페이스의 GitHub App 연결이 해제되었습니다. 다시 연결해 주세요.",
    action: "GitHub에서 다시 연결",
  },
  membership_suspended: {
    title: "워크스페이스 접근이 제한되었습니다",
    description: "이 워크스페이스 접근이 정지되었습니다. 워크스페이스 관리자에게 문의하세요.",
    action: undefined,
  },
} as const;

export function InstallationOnboardingGate({ onboardingState }: InstallationOnboardingGateProps) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLElement>(null);
  const shouldBlock =
    onboardingState !== null &&
    onboardingState !== "ready" &&
    pathname !== "/onboarding/install" &&
    !pathname.startsWith("/admin");

  useEffect(() => {
    if (!shouldBlock) {
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Blocked routes remain inaccessible to keyboard users until this modal is resolved.
    (getDialogFocusableControls(dialog)[0] ?? dialog).focus();

    return () => previouslyFocused?.focus();
  }, [onboardingState, shouldBlock]);

  // Keep the setup and support routes available while product routes are blocked.
  if (!shouldBlock) {
    return null;
  }

  const content = gateContent[onboardingState];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="installation-onboarding-title"
        tabIndex={-1}
        onKeyDown={trapDialogTabFocus}
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

function getDialogFocusableControls(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_CONTROL_SELECTOR)).filter(
    (control) => control.tabIndex >= 0,
  );
}

function trapDialogTabFocus(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") {
    return;
  }
  const controls = getDialogFocusableControls(event.currentTarget);
  if (controls.length === 0) {
    event.preventDefault();
    event.currentTarget.focus();
    return;
  }
  const currentIndex = controls.indexOf(document.activeElement as HTMLElement);
  const nextControl = event.shiftKey ? controls.at(-1) : controls[0];

  if (
    currentIndex === -1 ||
    (!event.shiftKey && currentIndex === controls.length - 1) ||
    (event.shiftKey && currentIndex === 0)
  ) {
    event.preventDefault();
    nextControl?.focus();
  }
}
