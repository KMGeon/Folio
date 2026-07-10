# PR Summary Prologue Design

## Context

Folio already asks the decomposition engine for a PR-level `prologue` and stores
it on the latest revision. The typed shape contains the information needed for a
review overview:

- `motivation`
- `outcome`
- an optional Mermaid `diagram`
- `keyChanges`
- `focusAreas`
- `complexity`

The decomposition prompt already tells the model to write these fields in Korean
and to generate Mermaid only when a change spans multiple components in a data or
control flow. The missing connection is the review read path: the backend does not
include the stored prologue in `ReviewPayload`, so the web overview shows only the
original GitHub PR description and comments.

## Goals

- Add a generated PR summary as the default overview tab when a valid prologue
  exists.
- Organize the summary into `Why this PR?`, `What it does`, `Key changes`, and
  `Review focus`.
- Render an optional Mermaid diagram inside `What it does` when the prologue
  provides one.
- Preserve the original GitHub PR description and conversation comments as
  separate tabs.
- Keep older reviews and invalid stored JSON usable through a quiet fallback to
  the existing description view.
- Follow Folio's dark, dense design system and current chapter-first layout.

## Non-Goals

- Do not regenerate prologues for existing revisions.
- Do not add or change a database table or migration.
- Do not render a diagram for every PR. Simple, single-file, rename, config,
  test-only, and dependency-only changes may omit it.
- Do not replace the original PR description or GitHub comments.
- Do not add editing, manual diagram authoring, or summary persistence from the
  browser.
- Do not redesign the chapter cards or chapter drill-in review flow.

## Recommended Approach

Pass the existing structured prologue through the review read API and render it
with focused web components. Load Mermaid dynamically only when a diagram is
present.

This keeps the stored data as the source of truth, avoids parsing generated prose
in the browser, and limits the feature to the currently missing API and UI
connections. Rendering Mermaid in the browser is preferable to backend SVG
generation because it avoids a new server rendering and sanitization pipeline.

## Data Flow and Contracts

The data flow is:

```text
decomposition engine
  -> PrologueSchema output
  -> revisions.prologue JSONB
  -> ReviewReadFacade validation
  -> ReviewPayload.prologue
  -> ReviewPrologue summary tab
  -> optional client-only Mermaid renderer
```

Extend both backend and frontend `ReviewPayload` contracts with:

```ts
prologue: Prologue | null;
```

Use `Prologue` from `@folio/types` rather than declaring a parallel web-only
shape. Add the workspace types package to the web package's dependencies if it is
not already declared.

At the database read boundary, validate `revision.prologue` with
`PrologueSchema.safeParse` before returning it. The schema's default converts an
older valid object with no `diagram` property to `diagram: null`. A null or invalid
object becomes `prologue: null`; it must not fail the entire review response.
Log invalid stored prologues at warning level with revision context, without
logging the generated content.

No migration or backfill is required. Existing revisions with a valid stored
prologue display it immediately, while revisions without one retain the current
experience.

## Web Component Boundaries

Keep `ReviewPrologue` responsible for tab selection and composition. Extract the
generated content and diagram rendering into focused components:

- `ReviewSummary`: maps the typed prologue to the four summary sections.
- `MermaidDiagram`: owns lazy loading, rendering lifecycle, accessibility, and
  diagram-only failures.
- Existing description markdown and conversation cards remain responsible for
  the `Description` and `Comments` tabs.

The tabs appear in this order:

1. `Summary`
2. `Description`
3. `Comments N`

When `prologue` is present, `Summary` is the initial tab. When it is null, do not
render the `Summary` tab and make `Description` the initial tab. The summary's
absence must not change the comments flow.

## Summary Information Design

Render the generated summary in this order:

### Why this PR?

Show `motivation`. If it is null, keep the section and show a subdued message that
the motivation was not clear from the change. Do not infer or synthesize missing
content in the browser.

### What it does

Show `outcome`. If it is null, use the same explicit, subdued unknown-state
treatment. If `diagram` is non-null, render it immediately after the outcome in a
bordered, horizontally scrollable diagram surface. If the diagram is null, render
no placeholder or empty diagram container.

### Key changes

Render each `keyChanges` item as a compact list entry with its `summary` first and
its `description` as secondary text. Preserve the generated order.

### Review focus

Start with the PR complexity level and its reasoning. Present the level as a
compact semantic badge, mapping `low`, `medium`, `high`, and `very-high` onto the
existing token language without introducing raw colors.

Then render each focus area with:

- severity
- title
- description
- related locations, shown as compact file-path metadata

Preserve the generated order so the model's prioritization is not silently
changed. Empty arrays remain valid UI states even though the live generator is
expected to supply content; show a quiet empty message rather than removing the
section.

## Layout and Visual Rules

The provided reference image defines the information hierarchy, not a pixel-level
theme replacement. Retain the current review overview grid: summary on the left,
chapter cards or activity on the right. Existing responsive behavior continues to
stack the columns on narrower screens.

Use the canonical tokens and existing primitives from the Folio design system:

- dark surfaces and hairline borders
- existing foreground and muted text tokens
- compact `text-xs`/`text-sm` metadata and body sizing
- current serif/mono roles already used by the review overview
- semantic primary, destructive, and muted states instead of new color values
- no new shadow tier or large decorative motion

The summary panel should remain readable inside the overview's own vertical page
scroll. A wide Mermaid graph may scroll horizontally within its card instead of
widening the overview column.

## Mermaid Rendering and Safety

`MermaidDiagram` is a client-only component. It dynamically imports `mermaid`
only after receiving a non-empty diagram source, preventing Mermaid from entering
the ordinary description-only bundle and avoiding server-rendering failures.

Initialize the renderer with:

- `startOnLoad: false`
- `securityLevel: "strict"`
- a dark/base theme configured from Folio's computed CSS tokens
- a conservative text/input-size limit

Reject an empty or over-limit source before calling Mermaid. Use a stable unique
render id per mounted diagram and prevent a stale async render from updating an
unmounted component.

The generated SVG is inserted only from Mermaid's strict renderer. The surrounding
container receives an accessible diagram label. Do not enable external links,
click callbacks, loose HTML labels, or arbitrary browser scripting.

If Mermaid cannot parse or render the source, isolate the error to the diagram
surface. Keep `What it does` prose and the rest of the review available, and show
a concise muted message in place of the diagram. Do not expose parser internals or
the raw generated source to the user.

## Error Handling

- Missing prologue: omit `Summary` and default to `Description`.
- Invalid stored prologue: backend returns `null`, warns with revision context,
  and leaves the review response successful.
- Missing motivation or outcome: retain the named section with a truthful unknown
  state.
- Missing diagram: render no diagram surface and do not load Mermaid.
- Invalid Mermaid syntax or renderer failure: replace only the diagram with a
  quiet error state.
- Missing key changes or focus areas: keep the section with a compact empty state.

## Testing

Add focused tests for the following behavior.

### Backend

- A valid stored prologue is included in `ReviewPayload`.
- A stored prologue without `diagram` is accepted and returned with
  `diagram: null`.
- Null or invalid prologue data returns `prologue: null` without failing the
  review.
- Existing chapter, comment, and commit data remains unchanged.

### Frontend

- A valid prologue renders `Summary` first and maps all four sections correctly.
- A null prologue omits `Summary` and starts on `Description`.
- `Description` and `Comments` remain selectable when a summary exists.
- Null motivation/outcome and empty arrays show their explicit quiet states.
- A null diagram does not mount or import the Mermaid renderer.
- A valid diagram produces the expected diagram surface.
- Mermaid syntax failure is contained without removing the summary prose.

### Visual Verification

Open a real PR review with a diagram-bearing prologue at desktop and narrow
viewport widths. Verify section hierarchy, wrapping, vertical page scroll,
horizontal diagram overflow, semantic contrast, and tab behavior.

Before completion, run the repository verification suite:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Decision Gates and Risks

This design requires no database, production-data, credential, deployment, or
external-write decision gate. Adding the Mermaid browser dependency changes the
web bundle and lockfile; verify that dynamic loading keeps it out of the initial
description-only path and that the production build succeeds.

The primary risk is model-produced Mermaid that is syntactically invalid or
computationally excessive. Strict rendering, input limits, async cleanup, and
diagram-only error isolation contain that risk without making the PR overview
unavailable.
