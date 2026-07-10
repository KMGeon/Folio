# Stage-Style Sidebar Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the full-height global labeled menu and match Stage's compact rail plus settings-only navigation structure.

**Architecture:** `GlobalNavigationRail` becomes a fixed-width icon rail with a small account popover, direct Dashboard/Settings links, and the existing search event. `SettingsShell` remains the only labeled sidebar and `AppSearch` remains the only command modal. No global drawer participates in `AppLayout` flow.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest, lucide-react.

## Global Constraints

- Normal dashboard and review routes show only the compact global rail.
- The global panel containing `Folio`, `대시보드`, `설치`, `설정`, username, and sign-out is removed.
- Settings routes keep the rail and use `SettingsShell` as the sole `w-64` labeled sidebar.
- The account trigger opens only a small account/workspace popover.
- Search continues to open the centered command modal with its current focus and dismissal behavior.
- Preserve unrelated uncommitted review-surface edits.

---

### Task 1: Replace the global drawer with the Stage-style rail

**Files:**
- Modify: `apps/web/src/components/global-navigation-rail.tsx`
- Modify: `apps/web/src/components/global-navigation-rail.test.tsx`

**Interfaces:**
- Consumes: `usePathname()`, `SessionUser`, `logoutUrl()`, and the `folio:focus-search` `CustomEvent` contract.
- Produces: a permanent compact rail, a settings back-to-app action, and a small account popover.

- [ ] **Step 1: Write failing regression assertions**

Replace the persistent-panel expectations with:

```ts
expect(railSource).toContain('className="relative z-50 h-svh w-12 shrink-0"');
expect(railSource).not.toContain('id="global-navigation-drawer"');
expect(railSource).not.toContain("w-60");
expect(railSource).not.toContain("Folio</span>");
expect(railSource).not.toContain('href: "/onboarding/install"');
expect(railSource).toContain('aria-haspopup="menu"');
expect(railSource).toContain('role="menu"');
expect(railSource).toContain('pathname.startsWith("/settings")');
expect(railSource).toContain('aria-label="앱으로 돌아가기"');
expect(railSource).toContain('href: "/dashboard"');
expect(railSource).toContain('href: "/settings/preferences"');
expect(railSource).toContain('new CustomEvent("folio:focus-search"');
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: FAIL because the current component reserves `lg:w-72` and renders `global-navigation-drawer` with `w-60` content.

- [ ] **Step 3: Implement the compact rail and account popover**

In `GlobalNavigationRail`:

```tsx
const settingsRoute = pathname.startsWith("/settings");

return (
  <aside ref={menuRef} className="relative z-50 flex h-svh w-12 shrink-0 flex-col items-center border-r bg-card/70 py-2">
    {settingsRoute ? (
      <Link href="/dashboard" aria-label="앱으로 돌아가기" className={railControlClassName}>
        <ArrowLeft className="size-4" />
      </Link>
    ) : (
      <button type="button" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((value) => !value)} className={railControlClassName}>
        {/* current avatar or BrandMark */}
      </button>
    )}
    {/* Dashboard and Settings RailLink entries, divider, and existing Search button */}
    {accountOpen && !settingsRoute ? (
      <div role="menu" className="absolute top-2 left-12 w-56 overflow-hidden rounded-lg border bg-popover shadow-lg">
        {/* Workspaces label, current user/workspace, and sign-out menu item */}
      </div>
    ) : null}
  </aside>
);
```

Remove the full-height drawer markup, `PlugZap`, its install destination, `lg:w-72`, `w-60`, and desktop transform overrides. Keep outside-click and Escape dismissal, active `aria-current`, logout behavior, and the current search `CustomEvent` including `detail.trigger`.

- [ ] **Step 4: Verify the focused test passes**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the rail reset**

Run: `git add apps/web/src/components/global-navigation-rail.tsx apps/web/src/components/global-navigation-rail.test.tsx && git commit -m "fix(web): match Stage sidebar structure"`

Expected: one commit touching only the rail component and test.

### Task 2: Verify settings and search ownership

**Files:**
- Verify: `apps/web/src/components/settings/settings-shell.tsx`
- Verify: `apps/web/src/app/settings/settings-routes.test.ts`
- Verify: `apps/web/src/components/app-search.tsx`
- Verify: `apps/web/src/components/app-search.test.tsx`

**Interfaces:**
- Consumes: the route navigation produced by Task 1.
- Produces: evidence that settings is the sole labeled sidebar and search remains a modal.

- [ ] **Step 1: Run focused navigation tests**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx apps/web/src/app/settings/settings-routes.test.ts apps/web/src/components/app-search.test.tsx`

Expected: all focused tests pass.

- [ ] **Step 2: Run static verification**

Run: `pnpm lint && pnpm typecheck`

Expected: both commands exit 0.

- [ ] **Step 3: Run repository verification**

Run: `pnpm test && pnpm build`

Expected: both commands exit 0. If the known unrelated dirty review-surface test fails, report it separately and do not edit those files.

- [ ] **Step 4: Inspect scope**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; unrelated review-surface edits remain preserved.

## Plan Self-Review

- Spec coverage: Task 1 removes the global labeled panel and defines rail, account, settings-back, and search behavior; Task 2 verifies settings/search ownership and the repository.
- Placeholder scan: no deferred implementation or ambiguous route ownership remains.
- Type consistency: no new public API is introduced; existing `SessionUser` and search event contracts are retained.
