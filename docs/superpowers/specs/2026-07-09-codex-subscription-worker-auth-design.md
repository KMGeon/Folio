# Codex Subscription Auth for Production Worker

## Goal

Folio production review jobs should use the Codex SDK with the EC2 host's
ChatGPT/Codex subscription login, not an OpenAI Platform API key. The worker must
keep the existing Docker deployment shape while making the host Codex login state
visible to the worker container.

## Current Behavior

The backend worker runs inside the `worker` Docker service and calls
`ReviewPullFacade.run()`. That facade fetches the PR diff, calls
`@folio/decomposition`, persists the review, then creates or updates the GitHub
PR comment.

`@folio/decomposition` currently uses `@openai/codex-sdk` for reviewable diffs.
The SDK spawns the local Codex CLI. In the current container, Codex cannot see the
EC2 host's logged-in Codex state, so it falls back to API-key style auth and fails
when `OPENAI_API_KEY` is absent.

## Target Behavior

The `worker` container should run Codex with:

- `CODEX_HOME=/home/ubuntu/.codex`
- `HOME=/home/ubuntu`
- a Docker bind mount from `/home/ubuntu/.codex` on the EC2 host to
  `/home/ubuntu/.codex` in the worker container

Only the `worker` service should receive this mount. `backend` and `web` do not
need Codex credentials and must not receive them.

The EC2 host already has a populated `/home/ubuntu/.codex` directory including
`auth.json`, `config.toml`, local state databases, cache, logs, packages, plugins,
skills, and tmp directories. The worker should reuse that state rather than
requiring `OPENAI_API_KEY`.

## Architecture

Keep the existing Docker Compose deployment. Update `docker-compose.yml` so the
worker service has a Codex state bind mount and explicit Codex environment.

The decomposition code can stay mostly unchanged because it already creates
`new Codex()` through `@openai/codex-sdk`. The key behavior change is the process
environment and filesystem visible to the spawned CLI.

Add a small preflight or diagnostic command to verify the container can see Codex
auth before re-running a review job. The check should not print tokens or
`auth.json`; it should only confirm safe facts such as whether `CODEX_HOME` exists,
whether auth/config files are present, and whether `codex --version` works in the
worker image.

## Security

The Codex login state is sensitive. The bind mount should be scoped to the worker
container only. Avoid logging file contents, tokens, or raw auth JSON.

A read-only mount would be preferable in principle, but Codex may refresh tokens,
write sessions, and update local state during normal runs. Use a read-write mount
initially so subscription auth can operate normally. Revisit a narrower mount only
after observing which files Codex actually writes during worker decomposition.

Do not add `OPENAI_API_KEY` to the server for this path, and do not make it a
production requirement for PR decomposition.

## Data Flow

1. GitHub sends a PR webhook.
2. Backend enqueues a `review_pull` job.
3. Worker claims the job.
4. Worker fetches PR metadata and diff through the GitHub App installation token.
5. Decomposition calls `@openai/codex-sdk`.
6. Codex SDK spawns the Codex CLI with `CODEX_HOME=/home/ubuntu/.codex`.
7. Codex uses the host subscription login state.
8. Decomposition returns chapters/prologue.
9. Worker persists the review and writes the marked GitHub PR comment.

## Error Handling

If Codex auth is missing or invalid inside the worker container, the job should
fail with a clear error in `jobs.last_error`. The operational fix is to refresh
the host Codex login and restart/recreate the worker so it sees the mounted state.

If the Codex SDK still attempts API-key auth after the mount, treat that as a
configuration failure: inspect `CODEX_HOME`, `HOME`, Codex config, and whether the
container can execute the bundled Codex CLI.

The existing queue retry/dead-job behavior remains unchanged.

## Verification

Use a PR smoke test after deployment:

1. Confirm `docker compose ps` shows `worker` up.
2. Confirm inside the worker container:
   - `CODEX_HOME=/home/ubuntu/.codex`
   - `/home/ubuntu/.codex/auth.json` exists
   - `/home/ubuntu/.codex/config.toml` exists
   - `codex --version` or the SDK-bundled Codex runtime is callable
3. Requeue or recreate a Folio PR job.
4. Confirm worker logs show the job was claimed without OpenAI API-key 401.
5. Confirm `jobs.status = succeeded`.
6. Confirm the PR receives or updates the `<!-- folio:chapters -->` comment.

Repository verification remains:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Non-Goals

- Do not replace Codex SDK with direct OpenAI API calls.
- Do not add an OpenAI Platform API key to production.
- Do not move the worker out of Docker.
- Do not mount Codex credentials into backend or web containers.
- Do not redesign decomposition prompts or chapter persistence in this refactor.
