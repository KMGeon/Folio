# Codex Subscription Worker Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production Docker worker use the EC2 host's Codex ChatGPT subscription login state instead of requiring `OPENAI_API_KEY`.

**Architecture:** Keep the existing Docker Compose deployment and mount the host Codex state only into the `worker` service. Add a host-side diagnostic script that verifies the worker container can see Codex auth without printing secrets. Document the operational login, deploy, and smoke-test steps.

**Tech Stack:** pnpm + TypeScript ESM monorepo, Docker Compose, NestJS worker, `@openai/codex-sdk`, Bash diagnostics, EC2 Ubuntu.

## Global Constraints

- Use the repo root as the working directory for commands unless a package-specific command is required.
- Do not commit real `.env`, `.env.dev`, or `.env.prd` files.
- Do not print private keys, Codex auth JSON, access tokens, or webhook secrets.
- Mount Codex credentials into `worker` only; do not mount them into `backend` or `web`.
- Keep the Docker worker architecture; do not move the worker to host systemd in this refactor.
- Do not add `OPENAI_API_KEY` as a production requirement for PR decomposition.
- Before preparing changes for push, run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

---

## File Structure

- `docker-compose.yml`: add worker-only `CODEX_HOME`, `HOME`, and host Codex state bind mount.
- `scripts/check-codex-worker-auth.sh`: new safe diagnostic script run from the EC2 deploy directory to verify the worker sees Codex auth and a callable Codex runtime.
- `docs/folio-smoke-test.md`: document the production Codex subscription auth smoke test and the PR comment verification flow.

---

### Task 1: Worker Compose Codex State Mount

```yaml
dag:
  id: "compose-codex-mount"
  purpose: "Make the Docker worker see the EC2 host Codex login state."
  deps: []
  parallel_group: "wave-1"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "docker-compose.yml"
    modules:
      - "deployment"
  verification:
    commands:
      - "ECR_REGISTRY=example.com ECR_REPOSITORY=folio IMAGE_TAG=test docker compose config"
    expected: "Command exits 0 and rendered worker service includes CODEX_HOME, HOME, and /home/ubuntu/.codex bind mount."
  risk:
    collision: "low"
    external_write: false
    database: false
    deployment: true
    notes: "Deployment behavior changes only for worker container environment and volumes."
  handoff_payload:
    include_spec_sections:
      - "Target Behavior"
      - "Security"
    include_plan_sections:
      - "Task 1: Worker Compose Codex State Mount"
```

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: EC2 host path `/home/ubuntu/.codex`.
- Produces: Worker container environment variables `CODEX_HOME=/home/ubuntu/.codex` and `HOME=/home/ubuntu`, plus a bind mount `/home/ubuntu/.codex:/home/ubuntu/.codex`.

- [ ] **Step 1: Inspect current worker service**

Run:

```bash
sed -n '1,80p' docker-compose.yml
```

Expected: PASS. The current `worker` service has `APP_PROFILE` and `NODE_ENV` but no `CODEX_HOME`, `HOME`, or `volumes`.

- [ ] **Step 2: Update worker environment and mount**

Modify only the `worker` service in `docker-compose.yml` so it matches this shape:

```yaml
  worker:
    image: ${ECR_REGISTRY}/${ECR_REPOSITORY}:worker-${IMAGE_TAG}
    command: ["pnpm", "--filter", "@folio/backend", "exec", "tsx", "src/worker.ts"]
    env_file:
      - .env
    environment:
      APP_PROFILE: prd
      NODE_ENV: production
      HOME: /home/ubuntu
      CODEX_HOME: /home/ubuntu/.codex
    volumes:
      - /home/ubuntu/.codex:/home/ubuntu/.codex
    restart: unless-stopped
```

Do not add this mount to `backend` or `web`.

- [ ] **Step 3: Render compose config**

Run:

```bash
ECR_REGISTRY=example.com ECR_REPOSITORY=folio IMAGE_TAG=test docker compose config > /tmp/folio-compose-config.yml
```

Expected: PASS with exit code 0.

- [ ] **Step 4: Verify worker-only mount**

Run:

```bash
grep -n "CODEX_HOME\\|HOME: /home/ubuntu\\|/home/ubuntu/.codex" /tmp/folio-compose-config.yml
```

Expected: PASS. Output includes worker `CODEX_HOME`, worker `HOME`, and one `/home/ubuntu/.codex` volume entry.

Run:

```bash
grep -n "source: /home/ubuntu/.codex" /tmp/folio-compose-config.yml | wc -l | tr -d ' '
```

Expected: prints `1`.

- [ ] **Step 5: Commit**

Run:

```bash
git add docker-compose.yml
git commit -m "fix(deploy): worker에 Codex 구독 인증 상태 mount"
```

Expected: PASS. Commit includes only `docker-compose.yml`.

---

### Task 2: Safe Worker Codex Auth Diagnostic Script

```yaml
dag:
  id: "worker-auth-diagnostic"
  purpose: "Add a safe EC2 diagnostic command for worker Codex subscription auth."
  deps: ["compose-codex-mount"]
  parallel_group: "wave-2"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "scripts/check-codex-worker-auth.sh"
    modules:
      - "deployment diagnostics"
  verification:
    commands:
      - "bash -n scripts/check-codex-worker-auth.sh"
    expected: "Command exits 0."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Script reads container state and must not print secret file contents."
  handoff_payload:
    include_spec_sections:
      - "Architecture"
      - "Verification"
    include_plan_sections:
      - "Task 2: Safe Worker Codex Auth Diagnostic Script"
```

**Files:**
- Create: `scripts/check-codex-worker-auth.sh`

**Interfaces:**
- Consumes: A running Docker Compose project whose `worker` service is up.
- Produces: Redacted diagnostic output with `SET/MISSING` style checks and no token contents.

- [ ] **Step 1: Create the script**

Create `scripts/check-codex-worker-auth.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail

service="${1:-worker}"

docker compose exec -T "$service" sh -lc '
set -eu
codex_home="${CODEX_HOME:-}"

printf "HOME:%s\n" "${HOME:-MISSING}"
printf "CODEX_HOME:%s\n" "${codex_home:-MISSING}"

if [ -z "$codex_home" ]; then
  echo "auth_dir:MISSING"
  exit 1
fi

if [ -d "$codex_home" ]; then
  echo "auth_dir:SET"
else
  echo "auth_dir:MISSING"
  exit 1
fi

for file in auth.json config.toml; do
  if [ -f "$codex_home/$file" ]; then
    printf "%s:SET\n" "$file"
  else
    printf "%s:MISSING\n" "$file"
    exit 1
  fi
done

if command -v codex >/dev/null 2>&1; then
  printf "codex_bin:"
  codex --version
else
  echo "codex_bin:MISSING"
  node -e "import(\"@openai/codex-sdk\").then(() => console.log(\"codex_sdk:SET\"), () => process.exit(1))"
fi
'
```

- [ ] **Step 2: Make it executable**

Run:

```bash
chmod +x scripts/check-codex-worker-auth.sh
```

Expected: PASS.

- [ ] **Step 3: Syntax-check the script**

Run:

```bash
bash -n scripts/check-codex-worker-auth.sh
```

Expected: PASS with no output.

- [ ] **Step 4: Verify the script never prints auth contents**

Run:

```bash
rg -n "cat .*auth|auth\\.json\\)" scripts/check-codex-worker-auth.sh || true
```

Expected: no output. The script may mention `auth.json` as a filename but must not read or print its content.

- [ ] **Step 5: Commit**

Run:

```bash
git add scripts/check-codex-worker-auth.sh
git commit -m "chore(deploy): worker Codex 인증 진단 스크립트 추가"
```

Expected: PASS. Commit includes only `scripts/check-codex-worker-auth.sh`.

---

### Task 3: Production Smoke-Test Documentation

```yaml
dag:
  id: "worker-auth-docs"
  purpose: "Document how to deploy and verify Codex subscription auth on EC2."
  deps: ["worker-auth-diagnostic"]
  parallel_group: "wave-3"
  worktree_strategy: "inter-worktree"
  worker_role: "implementer"
  scope:
    files:
      - "docs/folio-smoke-test.md"
    modules:
      - "operations documentation"
  verification:
    commands:
      - "rg -n \"Codex subscription auth|check-codex-worker-auth|folio:chapters\" docs/folio-smoke-test.md"
    expected: "Command exits 0 and finds the new smoke-test section."
  risk:
    collision: "low"
    external_write: false
    database: false
    deployment: false
    notes: "Documentation-only task."
  handoff_payload:
    include_spec_sections:
      - "Verification"
      - "Error Handling"
    include_plan_sections:
      - "Task 3: Production Smoke-Test Documentation"
```

**Files:**
- Modify: `docs/folio-smoke-test.md`

**Interfaces:**
- Consumes: `scripts/check-codex-worker-auth.sh` from Task 2.
- Produces: Operator instructions for EC2 deploy verification and PR #66/new PR smoke tests.

- [ ] **Step 1: Inspect existing smoke docs**

Run:

```bash
sed -n '1,220p' docs/folio-smoke-test.md
```

Expected: PASS. Use the existing style and append a compact production worker section.

- [ ] **Step 2: Add Codex subscription auth smoke section**

Append this section to `docs/folio-smoke-test.md`:

````markdown
## Production Worker Codex Subscription Auth

The production worker uses the EC2 host Codex login, not `OPENAI_API_KEY`, for
PR decomposition. The host must have a valid `/home/ubuntu/.codex` login state
before the worker is recreated.

On EC2:

```bash
cd /home/ubuntu/folio
./scripts/check-codex-worker-auth.sh
```

Expected safe output:

```text
HOME:/home/ubuntu
CODEX_HOME:/home/ubuntu/.codex
auth_dir:SET
auth.json:SET
config.toml:SET
codex_bin:<version>
```

If `codex_bin:MISSING` appears but `codex_sdk:SET` appears, the SDK is installed
and can still spawn its bundled runtime. If auth is missing, refresh the EC2 host
login with `codex login` before re-running worker jobs.

To verify end-to-end PR comments:

1. Confirm `KMGeon/Folio` has `folio_enabled=true`.
2. Open a small PR or push a new commit to an existing smoke PR.
3. Watch `docker compose logs -f worker`.
4. Confirm the job reaches `succeeded` in the `jobs` table.
5. Confirm the PR contains or updates a `<!-- folio:chapters -->` comment.
````

- [ ] **Step 3: Verify docs contain the new commands**

Run:

```bash
rg -n "Production Worker Codex Subscription Auth|check-codex-worker-auth|folio:chapters" docs/folio-smoke-test.md
```

Expected: PASS and prints three matching lines.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/folio-smoke-test.md
git commit -m "docs: Codex 구독 인증 smoke test 추가"
```

Expected: PASS. Commit includes only `docs/folio-smoke-test.md`.

---

### Task 4: Spec Compliance Review

```yaml
dag:
  id: "spec-review"
  purpose: "Review implementation against the approved design spec."
  deps: ["compose-codex-mount", "worker-auth-diagnostic", "worker-auth-docs"]
  parallel_group: "wave-4"
  worktree_strategy: "intra-worktree"
  worker_role: "spec-reviewer"
  scope:
    files:
      - "docker-compose.yml"
      - "scripts/check-codex-worker-auth.sh"
      - "docs/folio-smoke-test.md"
      - "docs/superpowers/specs/2026-07-09-codex-subscription-worker-auth-design.md"
    modules:
      - "deployment"
      - "operations documentation"
  verification:
    commands:
      - "git diff origin/main...HEAD -- docker-compose.yml scripts/check-codex-worker-auth.sh docs/folio-smoke-test.md"
    expected: "Reviewer reports PASS or concrete required fixes."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only review task."
  handoff_payload:
    include_spec_sections:
      - "Target Behavior"
      - "Security"
      - "Verification"
    include_plan_sections:
      - "Task 4: Spec Compliance Review"
```

**Files:**
- Review: `docker-compose.yml`
- Review: `scripts/check-codex-worker-auth.sh`
- Review: `docs/folio-smoke-test.md`
- Review: `docs/superpowers/specs/2026-07-09-codex-subscription-worker-auth-design.md`

**Interfaces:**
- Consumes: Tasks 1-3 implementation commits.
- Produces: Review result `PASS` or a list of required fixes.

- [ ] **Step 1: Compare implementation to spec**

Run:

```bash
git diff origin/main...HEAD -- docker-compose.yml scripts/check-codex-worker-auth.sh docs/folio-smoke-test.md
```

Expected: PASS. Reviewer checks that only worker gets Codex mount/env, no secret contents are printed, and docs describe the expected smoke flow.

- [ ] **Step 2: Report review result**

If compliant, report exactly:

```text
SPEC_REVIEW PASS
```

If not compliant, report:

```text
SPEC_REVIEW FAIL
- <file>:<line> <required fix>
```

---

### Task 5: Code Quality Review

```yaml
dag:
  id: "quality-review"
  purpose: "Review shell safety, compose validity, and repo style."
  deps: ["spec-review"]
  parallel_group: "wave-5"
  worktree_strategy: "intra-worktree"
  worker_role: "quality-reviewer"
  scope:
    files:
      - "docker-compose.yml"
      - "scripts/check-codex-worker-auth.sh"
      - "docs/folio-smoke-test.md"
    modules:
      - "deployment"
  verification:
    commands:
      - "bash -n scripts/check-codex-worker-auth.sh"
      - "ECR_REGISTRY=example.com ECR_REPOSITORY=folio IMAGE_TAG=test docker compose config >/tmp/folio-compose-config.yml"
    expected: "Both commands exit 0; reviewer reports PASS or concrete required fixes."
  risk:
    collision: "none"
    external_write: false
    database: false
    deployment: false
    notes: "Read-only quality review task."
  handoff_payload:
    include_spec_sections:
      - "Security"
      - "Verification"
    include_plan_sections:
      - "Task 5: Code Quality Review"
```

**Files:**
- Review: `docker-compose.yml`
- Review: `scripts/check-codex-worker-auth.sh`
- Review: `docs/folio-smoke-test.md`

**Interfaces:**
- Consumes: Spec review result.
- Produces: Review result `PASS` or a list of required fixes.

- [ ] **Step 1: Run static checks**

Run:

```bash
bash -n scripts/check-codex-worker-auth.sh
ECR_REGISTRY=example.com ECR_REPOSITORY=folio IMAGE_TAG=test docker compose config >/tmp/folio-compose-config.yml
```

Expected: PASS with exit code 0 for both commands.

- [ ] **Step 2: Inspect for secret leaks and over-broad mounts**

Run:

```bash
rg -n "cat .*auth|auth\\.json.*cat|OPENAI_API_KEY|/home/ubuntu/.codex" docker-compose.yml scripts/check-codex-worker-auth.sh docs/folio-smoke-test.md
```

Expected: PASS. Mentions of `/home/ubuntu/.codex` are expected; `OPENAI_API_KEY` may appear only in documentation saying it is not required; no command prints auth content.

- [ ] **Step 3: Report review result**

If acceptable, report exactly:

```text
QUALITY_REVIEW PASS
```

If not acceptable, report:

```text
QUALITY_REVIEW FAIL
- <file>:<line> <required fix>
```

---

### Task 6: Final Verification and EC2 Smoke Check

```yaml
dag:
  id: "final-verification"
  purpose: "Run local verification and, after deployment, verify EC2 worker can see Codex auth."
  deps: ["quality-review"]
  parallel_group: "wave-6"
  worktree_strategy: "intra-worktree"
  worker_role: "verifier"
  scope:
    files:
      - "docker-compose.yml"
      - "scripts/check-codex-worker-auth.sh"
      - "docs/folio-smoke-test.md"
    modules:
      - "deployment"
      - "worker operations"
  verification:
    commands:
      - "pnpm lint"
      - "pnpm typecheck"
      - "pnpm test"
      - "pnpm build"
      - "ssh -i /Users/mugeon/Desktop/PEM/MUGEON_AWS.pem ubuntu@13.125.163.224 'cd /home/ubuntu/folio && ./scripts/check-codex-worker-auth.sh'"
    expected: "Local checks pass; EC2 check passes after deployment. If deployment has not happened, report EC2 check as pending rather than failed."
  risk:
    collision: "none"
    external_write: true
    database: false
    deployment: true
    notes: "EC2 smoke check reads production container state; any deploy/recreate action is a decision gate."
  handoff_payload:
    include_spec_sections:
      - "Verification"
      - "Error Handling"
    include_plan_sections:
      - "Task 6: Final Verification and EC2 Smoke Check"
```

**Files:**
- Verify: `docker-compose.yml`
- Verify: `scripts/check-codex-worker-auth.sh`
- Verify: `docs/folio-smoke-test.md`

**Interfaces:**
- Consumes: All implementation and review tasks.
- Produces: Final verification report.

- [ ] **Step 1: Run repository checks**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS for all commands.

- [ ] **Step 2: Stop at deployment decision gate**

Before changing EC2 state, report:

```text
DEPLOYMENT_GATE
Need approval to sync updated docker-compose.yml and scripts/check-codex-worker-auth.sh to EC2, then recreate worker.
```

Expected: Stop until approval because this touches deployment.

- [ ] **Step 3: After deployment approval, verify EC2 worker auth**

Run:

```bash
ssh -i /Users/mugeon/Desktop/PEM/MUGEON_AWS.pem ubuntu@13.125.163.224 'cd /home/ubuntu/folio && ./scripts/check-codex-worker-auth.sh'
```

Expected safe output includes:

```text
HOME:/home/ubuntu
CODEX_HOME:/home/ubuntu/.codex
auth_dir:SET
auth.json:SET
config.toml:SET
```

- [ ] **Step 4: Verify PR comment path**

Requeue PR #66 or push a new commit to a smoke PR. Then run:

```bash
ssh -i /Users/mugeon/Desktop/PEM/MUGEON_AWS.pem ubuntu@13.125.163.224 'cd /home/ubuntu/folio && docker compose logs --tail=120 worker'
```

Expected: worker claims the `review_pull` job and does not fail with `Missing bearer or basic authentication`.

Run:

```bash
gh pr view 66 --json comments --jq '.comments[] | select(.body | contains("<!-- folio:chapters -->")) | {author:.author.login,url:.url}'
```

Expected: prints at least one Folio marked comment.

---

## Dispatch Gate

Spec: `docs/superpowers/specs/2026-07-09-codex-subscription-worker-auth-design.md`
Plan: `docs/superpowers/plans/2026-07-09-codex-subscription-worker-auth.md`

Waves:
- wave-1: `compose-codex-mount` using `inter-worktree`
- wave-2: `worker-auth-diagnostic` using `inter-worktree`
- wave-3: `worker-auth-docs` using `inter-worktree`
- wave-4: `spec-review` using `intra-worktree`
- wave-5: `quality-review` using `intra-worktree`
- wave-6: `final-verification` using `intra-worktree`

Risks:
- Codex auth state is sensitive. Mitigation: mount only into worker and never print auth file contents.
- Worker deployment behavior changes. Mitigation: validate compose config locally and stop at a deployment gate before EC2 sync/recreate.
- Existing worktree has unrelated user edits. Mitigation: implementation tasks touch only `docker-compose.yml`, `scripts/check-codex-worker-auth.sh`, and `docs/folio-smoke-test.md`.

Verification:
- `ECR_REGISTRY=example.com ECR_REPOSITORY=folio IMAGE_TAG=test docker compose config` expects exit code 0.
- `bash -n scripts/check-codex-worker-auth.sh` expects exit code 0.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` expect PASS.
- EC2 `./scripts/check-codex-worker-auth.sh` expects redacted `SET` checks after deployment.

Decision gates:
- Stop before syncing files to EC2 or recreating production worker.
- Stop if Codex auth exists on host but is not visible inside worker after mount.
- Stop if Codex SDK still attempts API-key auth after `CODEX_HOME` is visible.
- Stop if full repo verification fails for reasons unrelated to this plan.

Approve worker dispatch?

---

## Plan Self-Review

- Spec coverage: Task 1 covers target worker env/mount and worker-only scope. Task 2 covers safe diagnostic checks. Task 3 covers operational verification docs. Task 6 covers end-to-end PR comment verification.
- Placeholder scan: No incomplete markers or vague implementation-only instructions remain.
- Type and field consistency: DAG ids match dependencies; produced env names are consistently `HOME` and `CODEX_HOME`; script filename is consistently `scripts/check-codex-worker-auth.sh`.
- Wave safety: No same-wave tasks edit overlapping files. Implementation tasks are sequential because Task 3 documents Task 2's script.
