# Minimal EC2 Release Bundle Design

## Goal

Deploy Folio from ECR images without copying the application source tree to EC2.
The EC2 deployment directory must contain only the runtime configuration needed
by Docker Compose and Nginx, while preserving the production `.env` file.

## Current State

GitHub Actions builds the backend, worker, and web images and pushes them to ECR.
The `Sync release files` step then copies almost the entire repository to
`$DEPLOY_PATH`, even though the containers execute code from those images. The
remote source tree is redundant and leaves unnecessary files, including stale
environment backups, on the production host.

## Release Bundle

The workflow will create a temporary release directory containing exactly:

```text
docker-compose.yml
nginx/folio.conf
nginx/folio-http.conf
```

The production `.env` remains server-managed at `$DEPLOY_PATH/.env`; it is never
copied from the repository or included in the release bundle. The worker's
`/home/ubuntu/.codex` mount remains outside `$DEPLOY_PATH` and is unaffected.

## Synchronization and Cleanup

The release directory will be synchronized to `$DEPLOY_PATH` with rsync deletion
enabled and a receiver-side protection rule for the exact `.env` path. This makes
the desired bundle the source of truth:

- files absent from the bundle are removed from `$DEPLOY_PATH`;
- `$DEPLOY_PATH/.env` is protected from deletion;
- `.env.bak.*`, source directories, documentation, and repository metadata are
  not protected and are removed;
- files outside `$DEPLOY_PATH`, including Docker storage, Nginx installation
  files, TLS certificates, and `/home/ubuntu/.codex`, are untouched.

The sync step must verify that the local bundle contains all three required files
and that the remote `.env` exists before performing the destructive sync. A
missing required file or `.env` aborts the deployment.

## Deployment Flow

After synchronization, the existing deployment flow remains unchanged:

1. authenticate Docker against ECR;
2. pull the tagged backend, worker, and web images;
3. run database migrations from the backend image;
4. recreate the Compose services;
5. install the HTTPS or HTTP Nginx configuration from the bundle;
6. validate and reload Nginx;
7. run the existing deployment smoke checks.

The first minimal sync also cleans the existing EC2 directory. For the immediate
manual cleanup requested here, the same release bundle and protection rule will
be applied to the current host only after a dry run confirms that `.env` is
preserved and only redundant files are scheduled for deletion. Running containers
will not be restarted solely for this cleanup.

## Failure Handling

- Bundle construction failure stops before SSH or remote deletion.
- Missing remote `.env` stops before rsync deletion.
- Rsync failure stops the workflow before image pull and service recreation.
- Compose, migration, Nginx, or smoke-check failures retain the workflow's
  existing failure behavior.
- The current containers continue using their already-created configuration if
  the manual cleanup fails because source-tree removal does not alter running
  container filesystems.

## Verification

The change is configuration-only, so verification uses behavior-focused static
and deployment checks rather than application unit tests:

- parse the workflow YAML;
- verify the release bundle contains only the three approved files;
- run a local rsync dry run against a fixture containing `.env`, `.env.bak`, and
  redundant source files, confirming only `.env` survives;
- validate the Compose service set and rendered image references;
- run an EC2 rsync dry run and inspect its deletion list before cleanup;
- confirm the EC2 deployment directory contains exactly `.env` plus the release
  bundle after cleanup;
- confirm backend health, public HTTPS health, Docker Compose services, and Nginx
  configuration remain healthy.

## Non-Goals

- Changing image build or ECR tagging behavior.
- Moving production secrets into GitHub Actions or the repository.
- Changing container commands, ports, volumes, or restart policies.
- Removing Docker images, certificates, Nginx state, or Codex worker credentials.
