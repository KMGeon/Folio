# Contextual Navigation and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the compact global icon rail, show settings navigation only on settings routes, and open a centered search modal from the global search action.

**Architecture:** Remove the desktop-only global sidebar from `GlobalNavigationRail` so its `w-12` rail is always in layout flow. Keep `SettingsShell` unchanged as the settings-only sidebar. Move `AppSearch` from a header inline dropdown to one modal surface controlled by the existing `folio:focus-search` event.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest, lucide-react.

## Global Constraints

- Use existing dark-mode tokens and shadcn-compatible classes; do not introduce colors or routes.
- The compact rail stays `w-12` at every width; settings navigation remains owned by `SettingsShell`.
- Keep compact drawer dismissal and active-link accessibility intact.
- Search must autofocus, close via Escape/outside click/result selection, and reuse existing static and lazy PR results.
- Preserve unrelated uncommitted `review-top-bar` edits.

---

### Task 1: Restore the compact global rail

**Files:**
- Modify: `apps/web/src/components/global-navigation-rail.tsx`
- Modify: `apps/web/src/components/global-navigation-rail.test.tsx`

**Interfaces:**
- Consumes: `NAV_ITEMS`, `isActivePath`, and `window.dispatchEvent(new Event("folio:focus-search"))`.
- Produces: a `w-12` global rail at desktop and mobile; settings links still navigate to `/settings/preferences` for `SettingsShell` to render its own sidebar.

- [ ] **Step 1: Write the failing regression assertions**

Replace the desktop-sidebar source expectations with compact-rail expectations:

```ts
expect(railSource).toContain('className="relative z-50 h-svh w-12 shrink-0"');
expect(railSource).not.toContain('hidden h-svh w-60 flex-col');
expect(railSource).not.toContain('lg:w-60');
expect(railSource).not.toContain('lg:hidden');
expect(railSource).toContain('new Event("folio:focus-search")');
```

- [ ] **Step 2: Verify failure**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: FAIL because the component currently reserves `lg:w-60` and renders a desktop labeled global sidebar.

- [ ] **Step 3: Remove the desktop presentation**

In `global-navigation-rail.tsx`:

```tsx
<div ref={disclosureRef} className="relative z-50 h-svh w-12 shrink-0">
```

Delete the desktop-only `w-60` `<aside>`, remove `lg:hidden` from the compact rail and drawer, and retain its existing account trigger, dashboard/settings icon links, search event, drawer content, state, and dismissal effects.

- [ ] **Step 4: Verify success**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/web/src/components/global-navigation-rail.tsx apps/web/src/components/global-navigation-rail.test.tsx && git commit -m "fix(web): restore compact global navigation rail"`

Expected: one scoped navigation commit.

### Task 2: Convert search into a centered modal

**Files:**
- Modify: `apps/web/src/components/app-search.tsx`
- Create: `apps/web/src/components/app-search.test.tsx`

**Interfaces:**
- Consumes: `fetchDashboard`, Next `useRouter`, and `folio:focus-search`.
- Produces: `AppSearch`, a header-mounted component that opens a labeled centered dialog and navigates via `router.push(href)`.

- [ ] **Step 1: Write failing source-level modal tests**

Create `app-search.test.tsx` using the repository's file-source test style:

```ts
const source = readFileSync(resolve(__dirname, "app-search.tsx"), "utf8");

it("opens search as a dismissible modal", () => {
  expect(source).toContain('role="dialog"');
  expect(source).toContain('aria-modal="true"');
  expect(source).toContain('event.key === "Escape"');
  expect(source).toContain('setOpen(false)');
});

it("opens from the shared rail search event", () => {
  expect(source).toContain('window.addEventListener("folio:focus-search"');
  expect(source).toContain('setOpen(true)');
  expect(source).toContain('inputRef.current?.focus()');
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm exec vitest run apps/web/src/components/app-search.test.tsx`

Expected: FAIL because the current component renders an inline header input and result dropdown.

- [ ] **Step 3: Implement the modal surface**

Replace the always-visible inline input wrapper with a search trigger button in the header and conditional overlay:

```tsx
{open ? (
  <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-[10vh]" onMouseDown={closeIfBackdrop}>
    <div role="dialog" aria-modal="true" aria-label="검색" className="w-full max-w-2xl overflow-hidden rounded-lg border bg-popover shadow-lg">
      {/* input and the existing filtered result list */}
    </div>
  </div>
) : null}
```

Add a `useEffect` that, when `open` becomes true, calls `inputRef.current?.focus()`. Change the event listener to `setOpen(true)` rather than only focusing an invisible input. Add an Escape key listener while open. `closeIfBackdrop` must close only when `event.target === event.currentTarget`; the dialog itself stops propagation. Keep lazy PR loading, filtering, `go`, and result `onMouseDown` behavior, with `go` clearing query and closing before navigation.

- [ ] **Step 4: Verify success**

Run: `pnpm exec vitest run apps/web/src/components/app-search.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add apps/web/src/components/app-search.tsx apps/web/src/components/app-search.test.tsx && git commit -m "feat(web): open search in modal"`

Expected: one scoped search commit.

### Task 3: Run focused integration checks

**Files:**
- Verify: `apps/web/src/components/global-navigation-rail.tsx`
- Verify: `apps/web/src/components/global-navigation-rail.test.tsx`
- Verify: `apps/web/src/components/app-search.tsx`
- Verify: `apps/web/src/components/app-search.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx apps/web/src/components/app-search.test.tsx`

Expected: PASS.

- [ ] **Step 2: Run static checks**

Run: `pnpm lint && pnpm typecheck`

Expected: both commands exit 0.

- [ ] **Step 3: Inspect scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only Task 1 and Task 2 files are new changes, aside from pre-existing `review-top-bar` edits.

## Plan Self-Review

- Spec coverage: Task 1 covers the compact rail and settings ownership; Task 2 covers the centered modal, focus, lazy data, navigation, and dismissal; Task 3 validates both changes together.
- Placeholder scan: no deferred implementation items remain.
- Type consistency: no new public types are introduced; both components retain existing event and router contracts.
