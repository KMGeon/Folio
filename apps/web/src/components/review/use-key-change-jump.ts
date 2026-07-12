import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ReviewChapter } from "@/lib/review-api";

import {
  collectFocusLineMarkers,
  jumpTargetFromKeyChange,
  type FocusLineMarker,
  type JumpTarget,
} from "./resolve-line-ref";
import { filePanelId, setFilePathsCollapsed, type CollapsedFileState } from "./review-file-state";

/** Active jump stays visible long enough to scan a multi-line range. */
const JUMP_HIGHLIGHT_MS = 6000;
const JUMP_NOTICE_MS = 3000;

export function useKeyChangeJump(
  openChapter: ReviewChapter | null,
  setCollapsedFiles: Dispatch<SetStateAction<CollapsedFileState>>,
) {
  const [jumpTarget, setJumpTarget] = useState<JumpTarget | null>(null);
  const [activeKeyChangeId, setActiveKeyChangeId] = useState<string | null>(null);
  const [jumpNotice, setJumpNotice] = useState<string | null>(null);
  const jumpTokenRef = useRef(0);
  const lastAutoChapterRef = useRef<number | null>(null);

  const focusMarkers: FocusLineMarker[] = useMemo(
    () => (openChapter ? collectFocusLineMarkers(openChapter) : []),
    [openChapter],
  );

  useEffect(() => {
    setJumpTarget(null);
    setActiveKeyChangeId(null);
    setJumpNotice(null);
    lastAutoChapterRef.current = null;
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

  const handleJumpToKeyChange = useCallback(
    (keyChangeId: string) => {
      if (!openChapter) {
        return;
      }
      const keyChange = openChapter.keyChanges.find((item) => item.id === keyChangeId);
      if (!keyChange) {
        return;
      }

      setActiveKeyChangeId(keyChangeId);

      if (keyChange.lineRefs.length === 0) {
        setJumpNotice("이 질문에 연결된 diff 줄이 없습니다.");
        setJumpTarget(null);
        return;
      }

      jumpTokenRef.current += 1;
      const target = jumpTargetFromKeyChange(openChapter, keyChange, jumpTokenRef.current);
      if (!target) {
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
      const paths = [...new Set(target.ranges.map((range) => range.path))];
      setCollapsedFiles((current) => setFilePathsCollapsed(current, paths, false));
      setJumpTarget(target);
    },
    [openChapter, setCollapsedFiles],
  );

  // First open of a chapter: jump to the first unfinished focus question with a line link.
  useEffect(() => {
    if (!openChapter) {
      return;
    }
    if (lastAutoChapterRef.current === openChapter.index) {
      return;
    }
    const first =
      openChapter.keyChanges.find((item) => !item.viewed && item.lineRefs.length > 0) ??
      openChapter.keyChanges.find((item) => item.lineRefs.length > 0);
    if (!first) {
      lastAutoChapterRef.current = openChapter.index;
      return;
    }
    lastAutoChapterRef.current = openChapter.index;
    // Wait one frame so file panels mount before scroll/highlight.
    const frame = requestAnimationFrame(() => {
      handleJumpToKeyChange(first.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [openChapter, handleJumpToKeyChange]);

  return {
    handleJumpToKeyChange,
    jumpNotice,
    jumpTarget,
    activeKeyChangeId,
    focusMarkers,
  };
}
