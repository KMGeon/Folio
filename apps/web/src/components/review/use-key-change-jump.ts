import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ReviewChapter } from "@/lib/review-api";

import {
  jumpTargetFromResolved,
  selectFirstResolvableLineRef,
  type JumpTarget,
} from "./resolve-line-ref";
import { filePanelId, setFilePathsCollapsed, type CollapsedFileState } from "./review-file-state";

const JUMP_HIGHLIGHT_MS = 2000;
const JUMP_NOTICE_MS = 3000;

export function useKeyChangeJump(
  openChapter: ReviewChapter | null,
  setCollapsedFiles: Dispatch<SetStateAction<CollapsedFileState>>,
) {
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const [jumpNotice, setJumpNotice] = useState<string | null>(null);
  const jumpTokenRef = useRef(0);

  useEffect(() => {
    setJumpTarget(null);
    setJumpNotice(null);
  }, [openChapter?.index]);

  useEffect(() => {
    if (!jumpTarget) {
      return;
    }
    const timer = window.setTimeout(() => setJumpTarget(null), JUMP_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [jumpTarget]);

  useEffect(() => {
    if (!jumpNotice) {
      return;
    }
    const timer = window.setTimeout(() => setJumpNotice(null), JUMP_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [jumpNotice]);

  function handleJumpToKeyChange(keyChangeId: string) {
    if (!openChapter) {
      return;
    }
    const keyChange = openChapter.keyChanges.find((item) => item.id === keyChangeId);
    if (!keyChange) {
      return;
    }

    if (keyChange.lineRefs.length === 0) {
      setJumpNotice("이 질문에 연결된 diff 줄이 없습니다.");
      setJumpTarget(null);
      return;
    }

    const resolved = selectFirstResolvableLineRef(openChapter, keyChange.lineRefs);
    if (!resolved) {
      setJumpNotice("연결된 diff 줄을 찾지 못했습니다.");
      setJumpTarget(null);
      const fallbackPath = keyChange.lineRefs.find((ref) =>
        openChapter.files.some((file) => file.path === ref.filePath),
      )?.filePath;
      if (fallbackPath) {
        setCollapsedFiles((current) => setFilePathsCollapsed(current, [fallbackPath], false));
        // Allow the fallback file panel to uncollapse before it becomes the scroll target.
        requestAnimationFrame(() => {
          document
            .getElementById(filePanelId(openChapter.index, fallbackPath))
            ?.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      }
      return;
    }

    setJumpNotice(null);
    jumpTokenRef.current += 1;
    setCollapsedFiles((current) => setFilePathsCollapsed(current, [resolved.line.path], false));
    setJumpTarget(jumpTargetFromResolved(openChapter.index, resolved, jumpTokenRef.current));
  }

  return { handleJumpToKeyChange, jumpNotice, jumpTarget };
}
