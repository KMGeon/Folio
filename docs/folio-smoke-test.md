# Folio Webhook Smoke Test

This file exists solely to open a tiny pull request that exercises the
webhook → queue → worker → chapter-comment automation end to end.

It contains no production logic and can be deleted after the smoke test.

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
