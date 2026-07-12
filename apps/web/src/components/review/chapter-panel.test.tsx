// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ReviewApi from "@/lib/review-api";
import type { ReviewChapter } from "@/lib/review-api";

const mocks = vi.hoisted(() => ({
  setKeyChangeViewed: vi.fn(async () => ({ id: "kc-1", viewed: true })),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/review-api", async (importOriginal) => {
  const actual = await importOriginal<typeof ReviewApi>();
  return {
    ...actual,
    setKeyChangeViewed: mocks.setKeyChangeViewed,
  };
});

import { ChapterPanel } from "./chapter-panel";

const chapter: ReviewChapter = {
  index: 1,
  title: "관리자 계약",
  summary: "요약",
  files: [{ path: "a.ts", status: "modified", additions: 2, deletions: 0, viewed: false }],
  diffLines: [],
  keyChanges: [
    {
      id: "kc-1",
      content: "워크스페이스 상세 응답이 안전한가요?",
      lineRefs: [{ filePath: "a.ts", side: "additions", startLine: 1, endLine: 1 }],
      viewed: false,
    },
  ],
  viewed: false,
};

const mountedRoots: Root[] = [];
Object.assign(globalThis, { React });
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(async () => {
  await act(async () => {
    mountedRoots.splice(0).forEach((root) => root.unmount());
  });
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("ChapterPanel key-change controls", () => {
  it("calls onJumpToKeyChange when the question text is clicked", async () => {
    const onJump = vi.fn();
    const container = await mount(
      <ChapterPanel
        chapters={[chapter]}
        activeIndex={1}
        prPath="/o/r/pull/1"
        org="o"
        repo="r"
        number={1}
        onJumpToKeyChange={onJump}
      />,
    );

    await click(getButton(container, "관련 diff로 이동"));
    expect(onJump).toHaveBeenCalledWith("kc-1");
  });

  it("does not call onJumpToKeyChange when the checkbox is clicked", async () => {
    const onJump = vi.fn();
    const container = await mount(
      <ChapterPanel
        chapters={[chapter]}
        activeIndex={1}
        prPath="/o/r/pull/1"
        org="o"
        repo="r"
        number={1}
        onJumpToKeyChange={onJump}
      />,
    );

    await click(getCheckbox(container, /검토 완료/));
    expect(onJump).not.toHaveBeenCalled();
  });

  it("renders jumpNotice near 검토할 사항", async () => {
    const container = await mount(
      <ChapterPanel
        chapters={[chapter]}
        activeIndex={1}
        prPath="/o/r/pull/1"
        org="o"
        repo="r"
        number={1}
        jumpNotice="연결된 diff 줄을 찾지 못했습니다."
      />,
    );

    expect(container.textContent).toContain("검토할 사항");
    expect(container.textContent).toContain("연결된 diff 줄을 찾지 못했습니다.");
  });
});

async function mount(element: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

async function click(target: HTMLElement): Promise<void> {
  await act(async () => {
    target.click();
  });
}

function getButton(container: ParentNode, name: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }
  return button;
}

function getCheckbox(container: ParentNode, name: RegExp): HTMLButtonElement {
  const match = [...container.querySelectorAll<HTMLButtonElement>('button[role="checkbox"]')].find(
    (item) => name.test(item.getAttribute("aria-label") ?? ""),
  );
  if (!match) {
    throw new Error(`Checkbox not found: ${name}`);
  }
  return match;
}
