# Production Semver Releases Design

## Goal

Create a GitHub Release with a `vX.Y.Z` tag and title after every successful
production deployment, rather than exposing a deployment-run identifier.

## Scope

The existing `.github/workflows/release.yml` workflow remains triggered only by
a successful `Deploy` workflow on `main`. It will derive the next release
version from GitHub Release tags:

- Find the most recent tag that exactly matches `v<major>.<minor>.<patch>`.
- Increment only the patch component.
- Use `v0.0.1` when no prior semantic release exists.
- Ignore legacy `deploy-*` release tags for both versioning and commit-range
  calculation.

Each generated release targets the commit deployed by the triggering workflow,
is marked as GitHub's latest release, and retains the production-deployment
notes and included-commit list. The commit list starts after the prior semantic
release tag, or contains only the deployed commit for the first semantic
release.

## Reliability

Release creation is serialized with a workflow-level concurrency group. This
prevents independent successful deployments from calculating the same next
patch version while a prior release is still being created.

The workflow continues to use the deployed workflow's SHA rather than the
current `main` head, so the release always describes the exact production
artifact that passed smoke tests.

## Non-goals

- Do not create version-bump commits or update `package.json`.
- Do not introduce Changesets or semantic-release.
- Do not infer major or minor changes from commit messages.

## Verification

- Validate the workflow YAML parses successfully.
- Exercise the tag-selection shell logic with no semantic tags, legacy-only
  tags, and an existing semantic tag, confirming `v0.0.1`, `v0.0.1`, and the
  next patch version respectively.
