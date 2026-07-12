# Key-Change LineRef Jump Design

## Goal

In the chapter review right panel, let a reviewer jump from a **검토할 사항**
question to the strongest supporting diff line using the already-persisted
`keyChange.lineRefs` data. Checking off a question stays a separate action from
navigating to its evidence.

## Context

Folio already generates and stores chapter `keyChanges` with:

```ts
{
  id: string;
  content: string;
  lineRefs: Array<{
    filePath: string;
    side: "additions" | "deletions";
    startLine: number;
    endLine: number;
  }>;
  viewed: boolean;
}
```

The web review read model exposes `lineRefs` on each key change, and the chapter
file tree can scroll to a file panel via `filePanelId` + `scrollIntoView`. Diff
rows themselves have no stable line anchors, no jump API, and no highlight for
external navigation. The entire key-change row is currently one button that
toggles `viewed`, so navigation and completion are conflated.

The Stage-style review checks design expected each question to point at tight
line evidence. This design closes that gap on the chapter drill-in layout only.

## Confirmed Product Decisions

1. **Checkbox = viewed toggle only.** The checkbox (plus a small hit padding)
   continues to call the existing key-change viewed API.
2. **Question body click = jump.** Clicking the question text navigates to the
   first *valid* `lineRef`. It does **not** auto-mark viewed.
3. **Multi-ref:** use the first resolvable ref only. No multi-ref picker in this
   iteration.
4. **Collapsed files:** expand (uncollapse) the target file before scrolling.
5. **Highlight:** brief pulse (~2s), then clear. A new jump replaces the previous
   target immediately.
6. **Miss handling:** do not fail silently. If the line cannot be resolved, try
   scrolling to the file panel header when the path exists; always surface a short
   one-shot notice to the reviewer.
7. **Scope:** chapter drill-in layout only (diff + `ChapterPanel`). Files tab and
   overview chapter cards are out of scope.
8. **Out of scope:** markdown rendering in summaries/questions, chapter-panel
   contrast redesign (Approach A), URL hash deep links, GitHub review submission,
   automatic viewed-on-jump.

## Recommended Approach

Lift jump state to `ReviewView` and let `DiffViewer` apply expand / scroll /
highlight. Use stable DOM ids on diff rows only as scroll anchors.

| Approach | Summary | Trade-off |
| --- | --- | --- |
| A. DOM-only | Panel calls `getElementById` like the file tree | Simple, but brittle with collapsed files and highlight lifetime |
| **B. Parent-owned jump target (chosen)** | `ReviewView` holds `jumpTarget`; DiffViewer expands, resolves, scrolls, highlights | Small state lift; reliable with collapse and tests |
| C. URL hash deep link | Shareable `#path&side&line` | Useful later; YAGNI for this pass |

## Interaction

| Control | Behavior |
| --- | --- |
| Checkbox | Toggle `keyChange.viewed` (existing optimistic update + API) |
| Question text | Jump to first valid `lineRef` |
| Empty / all-miss refs | File header scroll when path exists + short notice |
| Chapter switch while jump pending | Clear `jumpTarget` |

Do not keep the whole row as a single `<button>`. Split into a checkbox control
and a separate jump control (button or equivalent with accessible name).

### Accessibility

- Checkbox: existing pressed/viewed semantics.
- Jump control: accessible name such as “관련 diff로 이동”.
- Jump control may use `cursor-pointer` and a light hover emphasis (`text-primary`
  or underline) without new color tokens.

### Visual meta (YAGNI)

Do not render `filePath:startLine` helper text under each question in the first
pass. Question text alone is the jump target.

## LineRef Resolution

Pure helper (suggested module name: `resolve-line-ref.ts` under the review
components folder — named for the domain action, not a generic helper dump):

```ts
resolveLineRef(chapter, ref) → ReviewDiffLine | null
```

Matching rules for the **anchor line** (first match wins within the chapter’s
`diffLines`):

| `side` | Line filter | Line number source |
| --- | --- | --- |
| `additions` | `path === filePath` and `kind !== "del"` | `newLineNumber ?? n` |
| `deletions` | `path === filePath` and `kind === "del"` | `oldLineNumber ?? n` |

A line matches when that number is in `[startLine, endLine]` inclusive. For a
range, the first matching line in document order is the anchor (typically the
`startLine` end of the range when the model is well-formed).

`selectFirstResolvableLineRef(chapter, lineRefs)` walks refs in order and returns
the first `{ ref, line }` pair that resolves, or `null`.

This mapping is aligned with how inline comments already interpret sides
(`del` → LEFT/old, otherwise RIGHT/new).

## Scroll, Expand, Highlight

Sequence after a question-body click:

1. `ChapterPanel` calls `onJumpToKeyChange(keyChangeId)` (or passes the ordered
   `lineRefs` for the active chapter’s key change).
2. `ReviewView`:
   - resolves the first valid ref against the open chapter;
   - on total miss: set a short-lived notice and, if any ref’s `filePath` exists
     on the chapter, scroll to that file panel header via existing `filePanelId`;
   - on hit: set `jumpTarget` and mark the file path uncollapsed in
     `collapsedFiles`.
3. `DiffViewer` / `FileDiffPanel`:
   - render a stable `id` on each diff row so jump can target it. Prefer
     `diff-line-{chapterIndex}-{encodedPath}-{lineKey}` where `lineKey` uniquely
     identifies the row (path is already scoped by the file panel; include
     `kind` + display line number, e.g. `add-42` / `del-10` / `ctx-42`). Jump
     scroll looks up the resolved `ReviewDiffLine`’s row id, not a re-derived
     guess from the raw `LineRef` alone;
   - apply highlight styles on the target row using existing tokens only
     (e.g. `bg-primary/20` / ring variants already used for active comment lines);
   - after paint (`requestAnimationFrame` double-rAF or equivalent short delay so
     uncollapse can layout), `scrollIntoView({ block: "center", behavior: "smooth" })`.
4. After ~2000ms, clear highlight from `jumpTarget` (keep scroll position). A new
   jump resets the timer and target.

Unified and split views both need the same row `id` and highlight behavior so
jump works regardless of `diffViewMode`.

## State Shape

Suggested parent state (names can vary; semantics are fixed):

```ts
type JumpTarget = {
  chapterIndex: number;
  path: string;
  side: "additions" | "deletions";
  line: number; // anchor line number as resolved
  // optional: epoch or nonce so re-clicking the same ref restarts highlight
  token: number;
};

type JumpNotice = {
  message: string;
  token: number;
} | null;
```

Clear `jumpTarget` when the open chapter changes. Notices are ephemeral and do
not persist across navigation.

## Error and Edge Cases

| Case | Behavior |
| --- | --- |
| `lineRefs` empty | Notice: no linked diff for this question |
| Path not in chapter | Notice; no scroll |
| Path exists, line miss | Scroll to file panel header + notice |
| Model points at another chapter’s file | Same as path miss / line miss for current chapter |
| File collapsed | Uncollapse, then scroll to line |
| Rapid successive jumps | Latest target wins; previous highlight cancelled |
| Open chapter changes | Clear jump target and notice |

Notice UI: dense, existing card/border tokens, dismisses automatically (~3s) or
on next successful jump. Prefer a small inline message in the chapter panel near
검토할 사항 over a global toast system (no toast infra required).

## Non-Goals (restate)

- Markdown / inline-code rendering in chapter summary or questions
- Approach A contrast pass for summary/section chrome (tracked separately if
  desired)
- Files-tab jump or filter work
- URL-hash deep linking and shareable line URLs
- Auto-checking viewed on jump
- Multi-ref list UI
- Backend or decomposition prompt changes (data already exists)

## Testing

1. **`resolveLineRef` unit tests**
   - additions match on `newLineNumber` / `n`
   - deletions match only `kind === "del"`
   - range selects first in-order match
   - miss returns null
2. **`selectFirstResolvableLineRef`**
   - skips a bad first ref and uses a later valid one
3. **Chapter panel**
   - checkbox click does not call jump
   - question click calls jump with the key change id / refs
4. **ReviewView / DiffViewer (component or integration-level)**
   - jump uncollapses target file
   - highlight class applied for the target token
   - miss path sets notice without throwing

## Implementation Touchpoints

| Area | Change |
| --- | --- |
| `chapter-panel.tsx` | Split checkbox vs jump controls; optional notice slot |
| `review-view.tsx` | Own `jumpTarget` / notice; wire panel → viewer; uncollapse |
| `diff-viewer.tsx` | Accept jump target; drive scroll after paint |
| `review-file-diff-panel.tsx` | Row ids + highlight for unified and split tables |
| New `resolve-line-ref.ts` (+ tests) | Pure mapping from `LineRef` → diff line |
| Existing tests | Extend panel / view coverage as above |

No API, schema, or worker changes.

## Success Criteria

- From a chapter with at least one key change that has a valid `lineRef`, clicking
  the question body scrolls the supporting line into view and briefly highlights it.
- Clicking the checkbox only toggles viewed state and does not scroll.
- Collapsed target files expand before the line is shown.
- Invalid refs produce a visible notice and never leave the reviewer with no
  feedback.
- Diff view mode (unified/split) does not break jump.

## Rollout

Single frontend change set on the review page. No migration, feature flag, or
backend deploy required. Safe to ship independently of chapter-panel contrast or
admin-console work.
