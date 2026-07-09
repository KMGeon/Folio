# Folio Webhook Smoke Test

This file exists solely to open a tiny pull request that exercises the
webhook → queue → worker → chapter-comment automation end to end.

It contains no production logic and can be deleted after the smoke test.

## Production Worker Codex Subscription Auth Visibility Check

The production worker uses the EC2 host Codex login, not `OPENAI_API_KEY`, for
PR decomposition. `OPENAI_API_KEY` is excluded in production; worker auth depends
on the host's Codex login state.

On EC2:

```bash
cd /home/ubuntu/folio
```

1. Confirm host login is present/usable with `codex login` (or refresh it if needed).
2. Recreate the worker container.
3. Run the visibility-only check:

```bash
./scripts/check-codex-worker-auth.sh
```

Expected safe output:

```text
auth_check_scope:visibility_only
auth_health_verified:NOT_VERIFIED
HOME:/home/ubuntu
CODEX_HOME:/home/ubuntu/.codex
codex_home_visible:SET
auth.json:VISIBLE
config.toml:VISIBLE
codex_bin:<version>
```

If `codex_bin:MISSING` appears but `codex_sdk:SET` appears, the SDK is installed
and can still spawn its bundled runtime.

This check only verifies container visibility (runtime/runtime-path and files), not
an authenticated Codex operation.

To verify end-to-end auth behavior:

1. Confirm `KMGeon/Folio` has `folio_enabled=true`.
2. Open a small PR or push a new commit to an existing smoke PR.
3. Watch `docker compose logs -f worker`.
4. Confirm the job reaches `succeeded` in the `jobs` table.
5. Confirm the PR contains or updates a `<!-- folio:chapters -->` comment.

The end-to-end PR job is the final auth validation step after the visibility check.
