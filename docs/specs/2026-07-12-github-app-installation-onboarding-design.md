# GitHub App installation onboarding guard

## Goal

Prevent authenticated users from reaching Folio's review UI before the GitHub
App is installed and connected to a usable workspace. The app must explain the
next step directly instead of leaving users to find the installation page.

## Scope

The guard applies to authenticated routes rendered inside `AppLayout`, except
`/onboarding/install`, which is the installation callback and claim screen.
Public pages and users without a session are unchanged.

The guard does not replace the existing repository-selection empty state. A
connected workspace with zero Folio-enabled repositories is ready to enter the
product and continues to use the dashboard's existing guidance.

## State contract

Extend the current workspace-context API with a server-derived onboarding
state:

```ts
type InstallationOnboardingState =
  | "ready"
  | "install_required"
  | "reinstall_required"
  | "membership_suspended";
```

`GET /api/v1/workspaces/current` remains the single context endpoint. Its
existing role, membership, entitlement, and system-admin fields remain intact.

| State | Server condition | UI behavior |
| --- | --- | --- |
| `ready` | Active membership in a workspace with at least one non-suspended GitHub App installation for that workspace account. | Do not render an overlay. |
| `install_required` | The active user has no workspace membership. | Block product content and prompt to install GitHub App. |
| `reinstall_required` | A workspace membership exists, but every installation linked to its GitHub account is suspended or absent. | Block product content and prompt to reconnect GitHub App. |
| `membership_suspended` | The selected membership is suspended. | Block product content and ask the user to contact a workspace administrator. |

The guard is intentionally based on Folio's persisted workspace connection,
not a client-side guess about a user's GitHub account. A normal Folio session
does not retain a GitHub user token that could safely enumerate installations.

## Installation-account consistency

An installation must be linked to the stable GitHub account ID before the
onboarding state can decide whether a workspace is connected. The backend will:

1. persist `githubAccountId` when synchronizing GitHub installation webhooks;
2. upsert the installation with that account ID during a successful protected
   workspace claim, so the callback is ready even if its webhook arrives late;
3. query only installations with `suspendedAt === null` when deriving `ready`.

This makes the callback path reliable while preserving webhook reconciliation
as the source of repository access. A later `installation.deleted` or suspend
event changes the next context read to `reinstall_required`.

## User flow

1. An authenticated user opens a product route.
2. The server resolves the workspace context and passes its onboarding state to
   the shared app shell.
3. The shell renders a compact, non-dismissible modal only when the state is
   not `ready`; product content remains visually behind the modal but cannot be
   used.
4. For `install_required` and `reinstall_required`, the primary action goes to
   the existing `/api/v1/auth/github/install` endpoint.
5. GitHub returns through the existing callback. Folio verifies the installer,
   mints the bounded claim proof, and renders `/onboarding/install`.
6. The existing claim action assigns the installer as `owner` for a new
   workspace or as `reviewer` for an already-owned workspace. After success it
   returns to settings; subsequent context reads are `ready`.

The modal copy is state-specific:

- `install_required`: “Folio를 시작하려면 GitHub App 설치가 필요합니다.”
- `reinstall_required`: “이 워크스페이스의 GitHub App 연결이 해제되었습니다. 다시 연결해 주세요.”
- `membership_suspended`: “이 워크스페이스 접근이 정지되었습니다. 워크스페이스 관리자에게 문의하세요.”

The first two states have a green primary installation action. The suspended
state has no installation action because reinstalling cannot override an
authority decision.

## UI design

Create a small client-side `InstallationOnboardingGate` composed by
`AppLayout`. It receives the already-resolved context from the server so the
dashboard never flashes before the guard appears. It uses the existing dark
surfaces, hairline borders, `Dialog` primitive, `Button`, and Lucide GitHub /
plug iconography. It does not introduce colors, typography sizes, or shadow
tiers outside the design system.

The gate bypasses `/onboarding/install` so the callback page can show the
existing claim button. It also does nothing when `AppLayout` has no signed-in
user.

## Error handling

If the context request fails, the server must not claim that GitHub App is
missing. Existing pages keep their normal error behavior instead of rendering
an inaccurate blocking modal. The API still enforces authorization on every
protected mutation; the modal is onboarding guidance, not a security boundary.

## Tests

Backend tests cover:

- each derived onboarding state;
- webhook and claim persistence of the GitHub account-to-installation link;
- suspended installations producing `reinstall_required`;
- an active installation producing `ready`.

Frontend tests cover:

- `ready` renders no modal;
- each blocking state renders the expected Korean copy;
- install and reconnect actions target the existing install endpoint;
- suspended membership cannot show an installation action;
- the callback route bypasses the guard.

## Non-goals

- Storing long-lived GitHub OAuth user tokens or enumerating a user's GitHub
  installations on every page load.
- Changing membership assignment, billing, repository activation, or the
  existing callback proof model.
- Letting a user dismiss or bypass an unresolved onboarding state.
