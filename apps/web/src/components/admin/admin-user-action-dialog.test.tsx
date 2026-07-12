// @vitest-environment happy-dom

import React, { act, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminUserActionDialog, type AdminUserAction } from "./admin-user-action-dialog";

const mountedRoots: Root[] = [];
Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => mountedRoots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("AdminUserActionDialog", () => {
  it.each([
    ["approve", "사용자 승인", "승인 대기 상태를 종료하고 Folio 사용을 허용합니다."],
    ["suspend", "사용자 정지", "Folio 접근을 정지하며 다시 활성화할 수 없습니다."],
    ["transfer", "관리자 이전", "이전이 완료되면 현재 계정은 /admin 접근 권한을 잃습니다."],
  ] as const)("names the target and exact %s consequence", async (action, label, consequence) => {
    const container = await mount(<Harness action={action} />);

    await click(button(container, "작업 열기"));

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
    expect(dialog?.textContent).toContain("octocat");
    expect(dialog?.textContent).toContain(consequence);
    expect(button(dialog!, label)).toBeTruthy();
    expect(button(dialog!, label).className.includes("bg-destructive")).toBe(action === "suspend");
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const container = await mount(<Harness action="approve" />);
    const trigger = button(container, "작업 열기");
    await click(trigger);

    await pressKey(container.querySelector('[role="dialog"]')!, "Escape");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from the backdrop and returns focus to the trigger", async () => {
    const container = await mount(<Harness action="suspend" />);
    const trigger = button(container, "작업 열기");
    await click(trigger);
    const backdrop = container.querySelector('[role="dialog"]')?.parentElement;

    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("traps forward and reverse Tab within the dialog", async () => {
    const container = await mount(<Harness action="transfer" />);
    await click(button(container, "작업 열기"));
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>("button")];
    const first = controls[0]!;
    const last = controls.at(-1)!;

    first.focus();
    await pressKey(first, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
    await pressKey(last, "Tab");
    expect(document.activeElement).toBe(first);
  });
});

function Harness({ action }: { action: AdminUserAction }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        작업 열기
      </button>
      {open ? (
        <AdminUserActionDialog
          action={action}
          targetLogin="octocat"
          trigger={triggerRef.current}
          pending={false}
          onCancel={() => setOpen(false)}
          onConfirm={vi.fn()}
        />
      ) : null}
    </>
  );
}

function button(container: ParentNode, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!match) {
    throw new Error(`Missing button: ${label}`);
  }
  return match;
}

async function mount(element: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
}

async function pressKey(
  target: Pick<EventTarget, "dispatchEvent">,
  key: string,
  init: KeyboardEventInit = {},
): Promise<void> {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
    );
  });
}
