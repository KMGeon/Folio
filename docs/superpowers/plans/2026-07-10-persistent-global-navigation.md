# Persistent Global Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the labeled global navigation visible by default on desktop while preserving the compact accessible drawer on narrow screens.

**Architecture:** `GlobalNavigationRail` will render a desktop-only `w-60` sidebar in normal flex flow and retain its current `w-12` rail plus slide-out drawer below `lg`. Both presentations consume `NAV_ITEMS` and `isActivePath`, so destinations and active-state rules remain centralized.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, Vitest, lucide-react.

## Global Constraints

- Dark mode only; use current sidebar, popover, accent, and border tokens.
- At `lg` and above the global sidebar remains `w-60`; below it the compact rail remains `w-12`.
- Preserve active-link `aria-current` plus compact drawer `aria-expanded`, Escape, outside-click, and route-change dismissal.
- Do not change routes, authentication, settings navigation, or global navigation destinations.
- Before handoff run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

### Task 1: Render persistent desktop navigation

```yaml
dag:
  id: persistent-navigation
  purpose: Render labeled navigation in normal desktop layout and preserve compact disclosure below lg.
  deps: []
  parallel_group: wave-1
  worktree_strategy: inter-worktree
  worker_role: implementer
  scope:
    files:
      - /Users/mugeon/orca/workspaces/Folio/corbina/apps/web/src/components/global-navigation-rail.tsx
      - /Users/mugeon/orca/workspaces/Folio/corbina/apps/web/src/components/global-navigation-rail.test.tsx
    modules: ["@folio/web global navigation"]
  verification:
    commands: ["pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx"]
    expected: All global navigation rail tests pass.
  risk:
    collision: low
    external_write: false
    database: false
    deployment: false
    notes: Responsive presentation changes are local to the global navigation component.
  handoff_payload:
    include_spec_sections: ["Proposed behavior", "Accessibility and interaction"]
    include_plan_sections: ["Task 1: Render persistent desktop navigation"]
```

**Files:**
- Modify: `apps/web/src/components/global-navigation-rail.tsx`
- Modify: `apps/web/src/components/global-navigation-rail.test.tsx`

**Interfaces:**
- Consumes: existing `NAV_ITEMS`, `isActivePath(pathname, href)`, `SessionUser`, and `logoutUrl()`.
- Produces: an always-visible desktop global sidebar and an unchanged compact disclosure experience.

- [ ] **Step 1: Write the failing layout test**

Add these source assertions to `provides the permanent rail and slide-out drawer`:

```ts
expect(railSource).toContain('hidden h-svh w-60 flex-col');
expect(railSource).toContain('lg:flex');
expect(railSource).toContain('lg:hidden');
expect(railSource).toContain('relative z-50 h-svh w-12 shrink-0 lg:w-60');
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: FAIL because only a `w-12` rail is initially in normal flow.

- [ ] **Step 3: Implement the responsive layout**

Set the outer wrapper to reserve desktop sidebar space:

```tsx
<div ref={disclosureRef} className="relative z-50 h-svh w-12 shrink-0 lg:w-60">
```

Insert before the compact rail a desktop-only sidebar:

```tsx
<aside className="hidden h-svh w-60 flex-col border-r bg-sidebar lg:flex">
  {/* existing Folio header, NAV_ITEMS links with isActivePath, and account/sign-out footer */}
</aside>
```

Use the existing drawer link class names, `NAV_ITEMS`, `isActivePath`, account name, and `signOut` handler in this sidebar. Add `lg:hidden` to the existing compact `w-12` rail and the existing `w-60` disclosure drawer. Do not change `open`, its effects, or disclosure attributes.

- [ ] **Step 4: Verify the focused test passes**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the implementation**

Run: `git add apps/web/src/components/global-navigation-rail.tsx apps/web/src/components/global-navigation-rail.test.tsx && git commit -m "fix(web): show global navigation by default"`

Expected: a commit containing only the navigation implementation and test.

### Task 2: Review specification compliance

```yaml
dag:
  id: spec-review
  purpose: Check implementation against approved desktop and compact navigation requirements.
  deps: [persistent-navigation]
  parallel_group: wave-2
  worktree_strategy: intra-worktree
  worker_role: spec-reviewer
  scope:
    files:
      - /Users/mugeon/orca/workspaces/Folio/corbina/apps/web/src/components/global-navigation-rail.tsx
      - /Users/mugeon/orca/workspaces/Folio/corbina/apps/web/src/components/global-navigation-rail.test.tsx
    modules: ["@folio/web global navigation"]
  verification:
    commands: ["pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx"]
    expected: PASS and source review finds no spec violation.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Read-only review; a finding requires a sequential fix task.
  handoff_payload:
    include_spec_sections: ["Proposed behavior", "Accessibility and interaction"]
    include_plan_sections: ["Task 1: Render persistent desktop navigation"]
```

**Files:**
- Review: `apps/web/src/components/global-navigation-rail.tsx`
- Review: `apps/web/src/components/global-navigation-rail.test.tsx`

- [ ] **Step 1: Check each requirement**

Confirm the desktop sidebar is visible with `lg:flex`, takes normal layout width without `open`, retains all links and account controls, and leaves the compact rail/drawer hidden at desktop but fully available below `lg`.

- [ ] **Step 2: Run focused verification**

Run: `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx`

Expected: PASS.

- [ ] **Step 3: Report the review**

Report `PASS` or `FAIL` with an exact file and line. Do not edit files in this task.

### Task 3: Review code quality

```yaml
dag:
  id: quality-review
  purpose: Check tokens, responsive class boundaries, accessibility, and test adequacy.
  deps: [spec-review]
  parallel_group: wave-3
  worktree_strategy: intra-worktree
  worker_role: quality-reviewer
  scope:
    files:
      - /Users/mugeon/orca/workspaces/Folio/corbina/apps/web/src/components/global-navigation-rail.tsx
      - /Users/mugeon/orca/workspaces/Folio/corbina/apps/web/src/components/global-navigation-rail.test.tsx
    modules: ["@folio/web global navigation"]
  verification:
    commands: ["pnpm lint", "pnpm typecheck"]
    expected: Both commands exit 0.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Read-only review using current checkout.
  handoff_payload:
    include_spec_sections: ["Component boundaries", "Accessibility and interaction"]
    include_plan_sections: ["Task 1: Render persistent desktop navigation", "Task 2: Review specification compliance"]
```

**Files:**
- Review: `apps/web/src/components/global-navigation-rail.tsx`
- Review: `apps/web/src/components/global-navigation-rail.test.tsx`

- [ ] **Step 1: Inspect implementation quality**

Verify the two presentations reuse `NAV_ITEMS` and `isActivePath`, use existing tokens, preserve accessible labels, and cannot leave a desktop overlay over review content.

- [ ] **Step 2: Run static checks**

Run: `pnpm lint && pnpm typecheck`

Expected: both commands exit 0.

- [ ] **Step 3: Report the review**

Report `PASS` or `FAIL` with a concrete required fix. Do not edit files in this task.

### Task 4: Run final repository verification

```yaml
dag:
  id: final-verification
  purpose: Verify the reviewed navigation change across the monorepo before handoff.
  deps: [quality-review]
  parallel_group: wave-4
  worktree_strategy: intra-worktree
  worker_role: verifier
  scope:
    files: [/Users/mugeon/orca/workspaces/Folio/corbina]
    modules: ["Folio monorepo"]
  verification:
    commands: ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm build"]
    expected: Every command exits 0.
  risk:
    collision: none
    external_write: false
    database: false
    deployment: false
    notes: Stop for a decision if a broad check fails with ambiguous ownership.
  handoff_payload:
    include_spec_sections: ["Verification"]
    include_plan_sections: ["Task 1: Render persistent desktop navigation", "Task 2: Review specification compliance", "Task 3: Review code quality"]
```

**Files:**
- Verify: repository root

- [ ] **Step 1: Run full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: every command exits 0.

- [ ] **Step 2: Inspect handoff state**

Run: `git status --short && git log -1 --oneline`

Expected: no uncommitted implementation files and the latest implementation commit is identifiable.

- [ ] **Step 3: Report final evidence**

Report the exact command results and the resulting commit.

## Plan Self-Review

- Spec coverage: Task 1 covers the desktop sidebar, retained compact disclosure, tokens, links, account controls, and accessibility; Tasks 2–4 provide focused and repository-wide validation.
- Placeholder scan: no deferred or unspecified requirements remain.
- Type consistency: no new interfaces are introduced; all task references use existing symbols.

## Dispatch Gate

**Dispatch Gate**

Spec: `docs/superpowers/specs/2026-07-10-persistent-global-navigation-design.md`
Plan: `docs/superpowers/plans/2026-07-10-persistent-global-navigation.md`

Waves:
- wave-1: `persistent-navigation` using `inter-worktree`
- wave-2: `spec-review` using `intra-worktree`, after `persistent-navigation`
- wave-3: `quality-review` using `intra-worktree`, after `spec-review`
- wave-4: `final-verification` using `intra-worktree`, after `quality-review`

Risks:
- Responsive markup could retain a desktop overlay or hide compact controls. The focused test and two review gates inspect both presentations.
- Full verification could expose unrelated baseline failures; ambiguous ownership stops execution for a decision.

Verification:
- `pnpm exec vitest run apps/web/src/components/global-navigation-rail.test.tsx` expects all focused tests to pass.
- `pnpm lint && pnpm typecheck && pnpm test && pnpm build` expects every command to exit 0.

Decision gates:
- Stop if review finds a spec violation, a required fix overlaps active work, or broad verification has ambiguous failure ownership.
