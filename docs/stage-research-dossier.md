# Research Dossier: "Stage" (stage-review) — Raw Material for a Clone PRD

**TL;DR**
- **Stage (stagereview.app, YC Spring 2026) is a GitHub-native code-review platform that uses AI to automatically break one ordinary pull request into ordered, logical "chapters" (mini-PRs), each with a summary, "what to review," and risk callouts — so reviewers build a mental model fast instead of slogging through alphabetical file diffs.** Its differentiation is *comprehension*, not bug-finding: it explicitly contrasts itself with AI nit-picking bots (CodeRabbit/Greptile) and with author-driven stacked-diff tools (Graphite), delivering the "small logical units reviewed in order" benefit without forcing the author to change their workflow.
- **The buildable core is three things:** (1) an AI diff-decomposition engine that emits structured chapters from a PR diff; (2) a GitHub App + bot ("stage-review") that posts a chapter table comment plus an "Open in Stage" Check Run and two-way-syncs comments/approvals; (3) a web review app (dashboard → PR summary → chapter-by-chapter diff viewer with mark-as-viewed progress + an in-app assistant "Stagent" that answers questions with file/line citations).
- **Recommended MVP technical path:** GitHub App (not OAuth/PAT) for repo access + "Login with GitHub" for sign-in; LLM semantic decomposition with light deterministic heuristics (auto-bucket lockfiles/generated/test files, feed commit messages + PR description as hints) and a post-validator; defer code-graph/AST dependency analysis to v2. Ship manual chapter editing early — trust in auto-decomposition is the make-or-break adoption factor.

---

## Key Findings

1. **The product is positioning-led, not model-led.** Stage's wedge is the *chapter metaphor* ("reading chapters of a book, not an unorganized set of paragraphs") and the claim that the bottleneck has shifted from writing code to *reviewing* it (AI agents flooding teams with large PRs). This is squarely supported by research: Microsoft Research (Bacchelli & Bird, *Expectations, Outcomes, and Challenges of Modern Code Review*) found "code and change understanding is the key aspect of code reviewing... most of which are not met by current tools." Stage is building for exactly that unmet need.

2. **Stage sits in its own sub-category** between (a) author-side workflow tools (Graphite stacked PRs) and (b) reviewer-side AI bug bots (CodeRabbit, Greptile, Copilot, Claude Code Review). It borrows the "small logical units, reviewed bottom-up in dependency order" insight from Meta/Google stacked diffs but removes the author burden by deriving the units with AI *after* one normal PR is opened.

3. **They've already shipped an open-source on-ramp** (`stagereview` npm CLI / `ReviewStage/stage-cli`) that reveals the architecture: the decomposition reasoning is expressed as an **agent "skill"** (`/stage-chapters`) the user's own coding agent runs locally, rendering chapters in a local browser viewer. The hosted product runs the same decomposition server-side against the PR diff. This tells a cloner that the "secret sauce" is a *prompt + a viewer + GitHub plumbing*, all of which are reproducible.

4. **GitHub integration is well-trodden ground.** A GitHub App + Checks API gives you the exact "Open in Stage" button behavior (custom `details_url` requires a GitHub App, specifically *not* a PAT/GITHUB_TOKEN), and two-way comment/approval sync is achievable via standard webhooks + REST. Rate limits and auth are not a real risk at MVP scale.

5. **The UX pattern is proven.** "Mark file as viewed → collapse → progress bar," per-revision review state, and auto-grouping of generated files all exist in GitHub and Reviewable today. Stage's novel layer is the *guidance* (PR summary + per-chapter "what to double-check" + risk callouts + citing assistant) and the *chapter ordering as a story*.

---

## Details

### 1. Product Identity & Company
Stage (stagereview.app), tagline **"A better code review platform" / "Putting humans back in control of code review."** Meta description: *"Stage organizes pull requests into logical chapters using AI, so reviewers understand your changes faster."* On YC: **"Code review platform for today's engineers,"** Spring 2026 batch, Developer Tools / SaaS, team size 2, primary partner Pete Koomen.

**Founders:** **Charles Pan** (Co-founder & CEO; Stanford CS '22, varsity fencing; prev. developer at Five Rings Capital, early engineer at Yuzu Health) and **Dean Stratakos** (Co-founder & CTO; Stanford CS '22, D1 varsity tennis; at Five Rings led the firm's AI push and built an in-house coding agent). They met freshman year at Stanford, worked at the same quant firm, were NYC roommates, then joined YC. *(The YC tile rendering both as "CTO" is a data artifact; bios indicate Pan=CEO, Stratakos=CTO.)*

**Thesis (verbatim themes):** "AI writes code faster than teams can review it." "The bottleneck isn't writing code anymore, it's reviewing it." "Code review bots are great at catching surface level bugs but don't solve the root problem... GitHub's UI hasn't changed in over a decade." Claimed customers: "top engineers at **Legora, n8n, Branch**, and more." Claimed outcome: review and merge PRs **"5x faster"** *(vendor marketing — unverified)*.

### 2. Core Value Proposition
- **Chapter metaphor:** a PR becomes "a story you can follow"; "structured chapters that surface intent, dependencies, and the diffs that matter."
- **Not a bug bot:** reorganizes review around *comprehension* ("understanding your systems"), not line-level nits — the explicit differentiator.
- **Self-review use case:** "I can have my coding agents put up a bunch of PRs, and then I'll look through the chapters rather than the raw code so I have a solid understanding before I request my teammates for review."
- **GitHub-native sync (critical):** "Comments and approvals are two-way synced with GitHub. Status checks, required reviews, and merge rules keep working exactly as you have them configured." Stage *layers on top of* GitHub; it doesn't replace it.

### 3. How It Works (landing page + YC + demo)
The canonical sequence:
1. "When you open a PR or push a new commit, Stage groups your changes into small logical **'chapters'**."
2. "These chapters get **ordered** in the way that makes most sense to read."
3. "For each chapter, Stage tells you **what changed and specific things to double check**."
4. "Once you review all the chapters, **you're done reviewing the PR!**"
5. Everything synced with GitHub (commenting, approving).

**The bot ("stage-review"):** posts a PR comment with a **table of chapters**, each linking to a view, plus an **"Open in Stage"** button, footer **"Chapters generated by Stage for commit [hash]."** Screenshot example — PR *"fix: route terminal OSC links through Orca"* → 3 chapters: (1) Enable ordinary click routing for OSC links; (2) Update terminal link hover hints; (3) Verify OSC link routing behavior in tests.

**Landing-page worked example (Stripe/RBAC PR), showing the chapter data model:**
- *"Add Stripe subscription management"* — "New subscription, portal, and webhook handlers with entitlements gating premium features behind the customer's plan."
- *"Migrate user roles to RBAC"* — "Replace ad-hoc role checks with a proper RBAC middleware. Existing users backfilled behind a feature flag."
- *"Remove dead email templates"* — "Drop three unused templates from the welcome / trial / payment-failed flow."

**Risk callouts** tie to specific files: "RBAC middleware rewrites the auth path — `rbac-middleware.ts` — In-flight sessions need to be backfilled into the new role table before deploy, or requests will 403." "Stripe webhook handler has no retry policy — `webhooks.ts` — If a webhook is dropped, subscription state diverges from Stripe. Add a reconciliation job."

**Stagent (in-app assistant):** "Ask Stagent what to review first, what's risky, or how a chapter fits together. **Answers cite the exact files and lines they came from.**" Canned prompts: "Summarize this PR / Walk me through the key changes / What looks risky here?" Example output: "Two files carry most of the risk... Start with these and work outward... Chapters 3 and 4 (dead templates, tests) are low-risk and can be skimmed."

### 4. The Demo Video (tella.tv/video/stage-demo-1pph)
By Dean Stratakos, Apr 15 2026, ~1:32, 490 views. Chapters: Introduction (0:00), Current GitHub Workflow (0:03), Stage Walkthrough (0:18), Self Review (1:07), Closing (1:19). Flow:
- Opens a real GitHub PR that "touches almost 2,000 lines of code across 44 different files... presented in alphabetical file order, so it's up to me to read through this, piece together what happened" (the pain).
- Stage **dashboard**: "helps me see what's important at a glance" (teams "always have a bunch of changes in flight").
- PR view: "the first thing I see is a helpful summary of what changed and where to focus my review."
- "Instead of diving into all the files changed, I can look at the **chapters**, which are essentially **mini PRs** that Stage has broken down for me... I can see all the chapters at a high level before I read them one by one." "Each chapter gives me a summary and tells me what are the most important things to review... I'm essentially reading through the story of the PR in the order that makes the most sense."
- Stagent for questions "without having to leave the platform."
- Setup: "It's super easy... you just need to sign in with GitHub. We also have a couple example PRs that you can check out on our website."

### 5. Pricing
"**Free for 14 days, no credit card required.**" Tiers: a **free tier "For open source and public projects"** and a **paid tier "For growing teams looking to ship faster."** YC launch promo: "free for your first 14 days, then use LAUNCH to get 25% off for 3 months." *Exact paid dollar amounts are not published in captured sources.*

### 6. The Open-Source CLI — the key technical tell
**`ReviewStage/stage-cli`** (public, MIT, ~97% TypeScript / 2.3% CSS, 68 commits, ~56 stars; npm package `stagereview` v0.1.2). README: "AI-powered code review tool that organizes local code changes into logical chapters and points out what to review before you dive into the code."
- Install: `npm install -g stagereview` → `npx skills add ReviewStage/stage-cli` → in the agent: `/stage-chapters`.
- "This organizes your local changes into reviewable chapters and **opens a browser UI**. Everything happens on your machine."
- Flags: `--base <ref>` (default auto-detect main/master), `--compare <ref>`, `--ref <mode>` where mode = `work` (staged+unstaged+untracked) | `staged` | `unstaged`. Examples: `/stage-chapters main..feature`, `/stage-chapters --base main --compare feature`.
- Repo layout: `skills/stage-chapters/` (the only skill), `.agents/ .claude/ .codex/` (per-agent install targets → cross-agent SKILL.md packaging), `packages/` (TS CLI + local viewer/web-server).

**Architectural insight:** the CLI **offloads the chapter-generation reasoning to the user's own coding agent** (Claude Code, Codex, Cursor) via a markdown "skill," then renders results in a local browser viewer. The hosted product presumably runs the same decomposition server-side on the PR diff. *The verbatim `stage-chapters/SKILL.md` prompt and the exact chapter JSON schema are robots/permission-blocked on the web — obtain by `git clone ReviewStage/stage-cli` and reading `skills/stage-chapters/SKILL.md` plus the chapter TypeScript interface in `packages/`.*

**Inferred chapter data model** (from all sources): `{ title, summary ("what changed"), files/hunks[], review_hints[] ("what to double-check"), risk[] (optional, file-scoped), order }`, plus a PR-level `{ overall_summary, where_to_focus[] }`. Reviewers can **mark individual files OR entire chapters as viewed**.

### 7. Competitive Landscape

**Graphite (graphite.dev) — closest "workflow" competitor.** Stacked-PR platform: `gt` CLI for dependent PRs; auto-restacking; stack-aware merge queue; CI optimizer; unified PR inbox; Slack; VS Code ext.; **Graphite Agent / "Diamond"** AI reviewer (codebase-aware, one-click fixes, doesn't store/train on code). Posts stack relationships as a PR comment for traversal. **Pricing (confirmed on graphite.com/pricing):** Free (Hobby); Starter $20/user/mo (annual); **Team "$40 Per user/month, billed annually... Unlimited access to Graphite Chat, Unlimited AI Reviews, AI Review customizations, Automations, Merge Queue"** — all plans include "a free, 30-day trial of our Team plan, no credit card required"; Enterprise custom. Anthropic-backed; used by Vercel, Snowflake, The Browser Company. **Contrast with Stage:** Graphite makes the *author* split work up front into stacked branches (workflow change + discipline); Stage splits an *existing* PR after the fact with AI (no author workflow change).

**AI bug-finding bots (adjacent category, not the same job):**
- **CodeRabbit** — largest installed base; reports **"connected to over 2 million repositories, processing more than 13 million Pull Requests, and serving over 8,000 paying companies including Chegg, Groupon, and Mercury"** (a parallel source cites 9,000+ orgs incl. Mercury, Writer, Abnormal Security, Ashby, Clerk). PR summaries, severity-tagged line comments, 40+ linters, one-click fixes, Mermaid sequence diagrams. GitHub/GitLab/Bitbucket/Azure DevOps. Free tier; Pro ~$24/user/mo annual ($30 monthly). Vendor-cited ~44% bug catch, low false positives.
- **Greptile** — indexes the *entire* repo into a code graph + embeddings; multi-hop cross-file reasoning; "TREX" writes/runs tests; learns standards from PR comments; self-host. GitHub + limited GitLab. $30/seat/mo (50 reviews incl., $1/extra), no free tier. Vendor-cited ~82% bug catch but higher FP (~22%); 3–5 min latency.
- **GitHub Copilot code review** — native, zero setup, cross-file, custom instructions via `.github/copilot-code-review-instructions.md`, MCP. Bundled with Copilot ($19–39/mo).
- **Claude Code "Code Review"** — GitHub App; parallel specialized agents + verification step to filter false positives; inline comments + a check run; tunable via CLAUDE.md/REVIEW.md; 👍/👎 per comment. Research preview (Team/Enterprise).
- **Others:** Qodo Merge (OSS roots, multi-platform, free self-host / ~$19/seat), Cursor BugBot ($40/seat, 8 passes + majority voting), Sourcery ($10/seat IDE), **Ellipsis** (PR summaries + review, GitHub-only, comments but no auto-fix), Korbit ($9/user/mo Pro, "zero-th reviewer," free for OSS), Sourcegraph Cody (monorepo/search context), plus Kodus, CodePeer, Bito, LinearB, Swimm, CodeAnt AI, Vercel Agent.

**Other review tools:** **Reviewable** (built on GitHub PRs; per-file/per-revision/per-reviewer "reviewed" state matrix; auto-groups renamed/reverted/vendored files — strong UX precedent). **Diffity** (agent-agnostic local diff viewer with "/diffity-tour" narrated walkthroughs — conceptually similar to chapters). Legacy: Gerrit (Google, patch-based), Phabricator/Differential (Meta; OSS dead 2021, fork Phorge), Crucible, Review Board, SmartBear Collaborator, Sider, Softagram.

**Stacked-diffs lineage (the intellectual ancestor):** originated at Google (Critique), popularized by Meta's Phabricator/Differential (Evan Priestley & Luke Shepard, 2007; OSS 2011). Principle: "Each branch in a stack should represent a discrete, logical unit of work that can be reviewed independently," reviewed bottom-up in dependency order. **GitHub launched native "Stacked PRs" in private preview on April 13, 2026**, via the optional `gh stack` CLI extension (per The Register, Apr 14, 2026: "a pull request to be based on a previous pull request to form a stack"). **Stage's innovation:** the same benefit *without* the author maintaining a branch stack — AI derives the logical units from one normal PR.

**Why this matters (the evidence base for the pitch):** code review is the most effective defect-catching technique — Fagan's foundational 1976 IBM study found inspection caught "82% of the total defects found for the released product" (38 defects/KLOC vs. 8/KLOC from unit tests). Microsoft Research's 2016 Windows study found "components that were code reviewed had 20-30% fewer defects than components that were not... the more review coverage a component had, the lower its defect density." And small diffs review better: the analysis cited in GitHub's Stacked PRs launch (InfoQ, Apr 2026) found "PRs between 200 and 400 lines had 40% fewer defects and were approved three times faster than larger ones." These are the strongest data points to anchor a PRD's problem statement.

### 8. Technical Approaches for PR Decomposition into Chapters (the core build problem)

**A) LLM semantic decomposition (Stage's approach; recommended for MVP).** Feed the unified diff + file paths + PR title/description + commit messages to an LLM; return an ordered set of chapters as **structured JSON** (`title, summary, file/hunk refs, review_hints[], risk[], order`). Field-tested engineering notes:
- Preserve per-file diff headers (`diff --git a/… b/…`, index, mode) on each chunk so the model knows the file; tokenize the header once per file, not per chunk.
- Keep context lines; when splitting at hunk boundaries, optionally duplicate ~3 context lines to avoid semantic breakage.
- For large diffs use recursive/first-fit-by-file chunking to fit token budgets; truncate at a MAX_DIFF_CHARS to bound latency; summarize per-file in 3–5 sentences at low temperature (~0.2), symbol-aware, explicitly flagging "formatting/no functional change."
- **Mitigate prompt injection** from malicious diff content (e.g., a committed `llm.md` instructing the model).

**B) Rule-based / heuristic (cheap baseline/fallback).** Group by existing **commits** (cheapest; authors often already commit logical units), by **directory/module**, by **file type** (tests vs. source vs. config vs. generated/lockfiles), or by **CODEOWNERS**. Deterministic, instant, zero token cost — but blind to *intent*.

**C) Dependency/AST-aware grouping (advanced).** Build a graph of changed symbols and their call/import relationships (cf. Greptile's code graph); group changes touching the same symbols/call sites; order prerequisites before dependents (new function before its call sites) — mirrors stacked-diff bottom-up review and deploy order (migration before logic, API before client).

**D) Hybrid (recommended for v1+).** AI proposes chapters; deterministic rules enforce invariants (every hunk assigned exactly once; lockfiles/generated/tests auto-bucketed; tiny PRs → single chapter); **author/reviewer can re-group, rename, reorder, merge/split** and Stage remembers the edit. Commits + CODEOWNERS feed the AI as hints.

**MVP recommendation:** **Approach A** with light **B** preprocessing (strip/auto-bucket lockfiles & generated files; pass commit messages + PR description as hints) plus a deterministic post-validator. Defer **C** to v2. Ship manual editing (**D**) early — trust in auto-decomposition is the adoption gate.

### 9. GitHub Integration Architecture (high level)
**App type: build a GitHub App** (not OAuth App, not PAT/service account) — first-class, fine-grained permissions, per-installation auth, higher/scaling rate limits. Pair it with **OAuth "Login with GitHub"** for web-app sign-in ("you just need to sign in with GitHub").

**Fine-grained permissions:** Pull requests (read/write), Contents (read), **Checks (read/write)** for the "Open in Stage" check run, Metadata (read), optionally Commit statuses (write).

**Webhooks:** `pull_request` (opened, synchronize, reopened, closed), `pull_request_review` / `pull_request_review_comment` / `issue_comment` (two-way comment & approval sync), `check_run`/`check_suite` (rerequested actions), `installation`/`installation_repositories` (lifecycle). Subscribe to webhooks rather than poll to conserve rate limit; dev via smee.io proxy.

**Auth flow:** App private key → short-lived **JWT (≤10 min)** → **installation access token (TTL 1 hr, scoped)** → Octokit calls. Verify webhooks with **HMAC-SHA256** + webhook secret. Store secrets securely.

**Posting results:**
- **PR comment** with the chapter table + per-chapter links + "Open in Stage" button + "Chapters generated by Stage for commit `<sha>`" footer; **edit the same comment in place** on new commits.
- **Check Run** (Checks API, GitHub-App-only) on the head SHA with a custom **`details_url`** → the Stage web app (this is what enables a clickable "Open in Stage" link; a custom `details_url` specifically requires a GitHub App, not GITHUB_TOKEN/PAT). Check runs support status/conclusion, rich Markdown output, line annotations, and up to 3 "requested action" buttons (label ≤20 chars) firing `check_run.requested_action`.

**Rate limits:** App installation token = **5,000 req/hr** (15,000 on Enterprise Cloud orgs); non-Enterprise installs scale +50/hr per repo over 20 repos and +50/hr per user over 20 users, capped 12,500/hr. Use conditional requests (ETag/Last-Modified — note 1-hr token TTL invalidates cached ETags), GraphQL for nested fetches, honor `Retry-After`/`x-ratelimit-reset`. Octokit is the official SDK.

**Diff acquisition:** `GET /repos/{o}/{r}/pulls/{n}` + `/files` (paginate; 30 default, 100 max) or fetch `.diff`/`.patch`; watch the changed-files cap on huge PRs.

### 10. Review UI/UX Best Practices
- **Diff viewer:** unified/split toggle, syntax highlighting, hide-whitespace, side-by-side collapsing to unified on narrow screens, full keyboard nav (next/prev change/comment), per-line & multi-line comments, Markdown comments with @mentions.
- **Progress tracking = the core chapter mechanic:** "mark file as viewed" collapses + advances; **progress bar** (files/chapters viewed); **"mark entire chapter as viewed";** auto-unmark a file if it changes after you viewed it (GitHub + Reviewable behavior). Stage's completion model: "review all the chapters → done."
- **Per-revision review state** (Reviewable): track reviewed state per file *per revision per reviewer*, so re-reviews show only what changed — a strong fit for "push new commit → re-chaptered."
- **Navigation:** file tree + chapter list; jump between logical units; keyboard shortcuts to advance chapters; auto-group/hide generated, renamed, reverted, vendored files.
- **Guidance layer (Stage's signature):** PR-level summary + "where to focus"; per-chapter "what changed + what to double-check + risk"; **Stagent** assistant answering "what to review first / what's risky / how does this fit" with **citations to exact files+lines**.
- **Story ordering:** present chapters in reading/dependency/risk order (bottom-up, à la stacked diffs).

### 11. Suggested Phasing for a Clone
- **MVP (GitHub-only):** GitHub App + Login with GitHub; on `pull_request` opened/synchronize → fetch diff → LLM semantic decomposition (A + light B) → store chapters → post/edit PR comment with chapter table + "Open in Stage" + create Check Run w/ custom `details_url`. Web app: dashboard of in-flight PRs; PR view with overall summary + chapter list; diff viewer with mark-as-viewed (file + chapter) + progress; basic GitHub comment/approval sync. Free 14-day trial.
- **v1:** Stagent (Q&A with file/line citations); manual chapter editing (rename/reorder/merge/split, remembered); per-revision review state + re-chaptering on new commits; risk callouts; team dashboard; self-review flow; richer two-way sync (approvals, required checks).
- **v2:** Code-graph/AST dependency analysis (C) for smarter grouping/ordering; org analytics (review time, throughput); custom rules/standards files; deeper merge-rule integration; possibly GitLab/Bitbucket; SSO/enterprise/self-host. (The local agent-driven CLI already exists as a free on-ramp.)

---

## Recommendations

1. **Lead the PRD with the comprehension thesis, not bug-catching.** Anchor the problem statement in the named evidence: Fagan 1976 (review caught 82% of released-product defects), Microsoft Research 2016 (20–30% fewer defects in reviewed components), and the 1.5M-PR analysis (200–400-line PRs: 40% fewer defects, approved 3× faster). Frame Stage's value as restoring *understanding* under AI-accelerated PR volume — Bacchelli & Bird's finding that "code and change understanding is the key aspect of code reviewing... not met by current tools" is your single best citation.

2. **Treat the decomposition engine as the product moat and de-risk it first.** Before writing the full PRD, `git clone ReviewStage/stage-cli` and read `skills/stage-chapters/SKILL.md` + the `packages/` chapter interface — that prompt and schema are the highest-leverage artifacts you can study, and they're freely licensed (MIT) for reference. Build a thin prototype of Approach A on 10–20 real PRs and judge chapter quality before committing UI scope.

3. **Build the GitHub App + Check Run "Open in Stage" path in the first sprint.** It's the visible hook in the PR and is technically settled (custom `details_url` on a Check Run requires a GitHub App — bake that constraint into the architecture from day one). Edit-in-place the chapter comment on each new commit.

4. **Ship manual chapter editing in MVP or v1, not v2.** Every adjacent tool's adoption failure mode is "developers ignore the bot" when output is noisy. Letting reviewers re-group/rename/merge/split chapters (and remembering it) is the trust mechanism that converts skeptics.

5. **Differentiate hard from Graphite and from bug bots in copy and feature scope.** Don't build a merge queue or a stacked-PR CLI (Graphite owns that); don't compete on raw bug-catch benchmarks (Greptile/CodeRabbit own that). Own "understand the PR in chapters + ask the citing assistant." Consider keeping the OSS CLI as a free, agent-agnostic acquisition funnel like Stage does.

**Benchmarks that would change the plan:** If prototype chapter quality on real PRs is poor (reviewers disagree with >~30% of groupings), prioritize Approach C (code-graph) earlier and lean harder on commit-boundary heuristics. If GitHub's native Stacked PRs (private preview Apr 2026) ships broadly and gains traction, re-evaluate whether "post-hoc AI chaptering" still beats "native stacking" for your target teams — Stage's no-author-workflow-change advantage is the thing to defend.

## Caveats
- **Exact paid pricing** for Stage's tiers is not published in captured sources (only "free 14 days," a free OSS/public tier, and a paid team tier).
- **The verbatim `stage-chapters` SKILL.md prompt and the chapter JSON schema** are in the repo but were not web-retrievable (robots/permission-blocked); retrieve via `git clone`.
- **"5x faster" and customer logos (Legora, n8n, Branch)** are vendor marketing, unverified.
- **Bug-catch benchmark numbers** for CodeRabbit (~44%) and Greptile (~82%) are largely vendor-cited; treat as directional, not independent.
- **CodeRabbit's scale figures** vary by source (8,000 vs. 9,000+ paying orgs; 2M repos / 13M PRs) — both are CodeRabbit-reported.
- The **YC page listing both founders as "CTO"** is a rendering artifact; bios indicate Pan = CEO, Stratakos = CTO.
