# Async Review Lifecycle Design

## Goal

Let a user explicitly request a missing Folio review, return immediately to the
Dashboard, observe the worker's progress, and see the pull request move to
Complete only after Folio analysis and GitHub chapter-comment creation succeed.

## Product Semantics

Dashboard buckets represent Folio review lifecycle, not GitHub pull-request
lifecycle:

- **Ready to Review**: Folio generation was requested and is queued, running, or
  retrying. A terminal generation or comment failure remains here with a failed
  state and a retry action.
- **Complete**: the latest requested head SHA has a succeeded `review_pull` job
  whose result contains a GitHub comment URL.
- **Your pull requests**: no Folio generation request exists for the latest head
  SHA and the signed-in user authored the pull request.
- **Other**: no Folio generation request exists for the latest head SHA and a
  different user authored the pull request.

GitHub `open`, `draft`, `merged`, and `closed` remain visible as card badges but
do not choose the Dashboard bucket. The existing bounded closed-PR window remains
the source for recent merged and closed candidates, so already closed PRs can
still be requested and tracked.

## User Flow

1. The user opens a Dashboard pull-request card.
2. If a persisted Folio review exists, the review screen renders normally.
3. If no review exists, the page renders an explicit missing-review prompt:
   `No Folio review exists for owner/repo#number. Create one now?`
4. Confirming calls the authenticated manual-generation endpoint.
5. The backend fetches the current GitHub head SHA and idempotently enqueues one
   `review_pull` job for `(owner, repo, headSha)`.
6. The endpoint returns HTTP 202 with the job identifier and queue state; it does
   not run decomposition in the request process.
7. The web app navigates to `/dashboard` immediately.
8. The card appears in Ready to Review with a queued, processing, or retrying
   indicator.
9. The Dashboard polls only while at least one visible card has an active job.
10. When the worker succeeds and returns a non-null `commentUrl`, the card moves
    to Complete.

Canceling the prompt returns to the Dashboard without creating a job. Repeated
confirmations are safe because the queue's existing dedupe key permits only one
active job per repository, head SHA, and job kind.

## Backend Architecture

### Manual generation endpoint

`POST /api/v1/pulls` keeps its existing authorization guards but changes from a
synchronous call to `ReviewPullFacade.run` into an asynchronous request:

1. resolve the Folio repository and installation;
2. fetch the current PR summary to obtain the authoritative head SHA;
3. call `ReviewJobQueue.enqueueReviewPull`;
4. return HTTP 202 with `{ jobId, status, deduplicated }`.

The controller delegates this orchestration to a focused application facade. It
does not write jobs directly or trust a browser-supplied head SHA.

### Lifecycle projection

The Dashboard builds a review-lifecycle projection for each GitHub candidate from
the latest `review_pull` job matching its repository and current head SHA:

| Job/result state | Projected state | Bucket |
| --- | --- | --- |
| no job | `not_requested` | Yours or Other |
| `pending` / `claimed` / `running` | `processing` | Ready to Review |
| `failed` with retries remaining | `retrying` | Ready to Review |
| `dead` | `failed` | Ready to Review |
| `succeeded` with `commentUrl` | `complete` | Complete |
| `succeeded` with null `commentUrl` or `commentError` | `failed` | Ready to Review |

The projection is exposed on Dashboard cards as `analysisStatus`. Job error text
is mapped to a safe user-facing summary; raw worker errors are not returned.
Database lookup is batched by repository and head SHA so the Dashboard does not
add one job query per card.

### Retry

Retry uses the same authenticated POST endpoint. For an active job, enqueue is
idempotent and returns the existing job. For `dead` or succeeded-with-comment-
error work, the terminal row no longer blocks the dedupe key, so a new job can be
created for the same head SHA.

The worker remains the only component that runs `ReviewPullFacade.run`, persists
reviews, and writes GitHub comments.

## Frontend Architecture

The PR overview server component stops calling `fetchReviewOrCreate`. It calls
`fetchReview` once:

- success renders `ReviewView`;
- 401 redirects to login;
- 404 renders a client-side missing-review prompt;
- other errors use the existing error boundary.

The prompt owns confirm/cancel/loading/error states. Confirm calls `createReview`,
then uses `router.replace("/dashboard")`. It disables duplicate submission while
the request is in flight.

Dashboard card data gains `analysisStatus` and `githubStatus`. Bucket selection
uses analysis state first, then author ownership for `not_requested` cards. Cards
in Ready to Review show queued/processing/retrying/failed status. Failed cards
offer Retry. Complete cards link to the persisted review.

Dashboard polling runs every three seconds only while a visible item is
`processing` or `retrying`. It resets the relevant open and completed request
scopes together so a completed card moves columns without a full-page refresh.
Polling stops when no active lifecycle state remains or the component unmounts.

## Failure Handling

- Authorization failure leaves the user on the prompt and displays the API error.
- GitHub PR lookup failure does not enqueue a job and returns a retryable error.
- Duplicate submission returns the existing active job and still redirects.
- Worker retry states remain visible instead of disappearing from the board.
- A dead job or missing GitHub comment never appears in Complete.
- If a newer head SHA arrives, its lifecycle is independent; an older successful
  job cannot mark the new revision Complete.
- GitHub webhook delivery and manual requests share the same dedupe key, so they
  cannot create concurrent work for the same revision.

## Data Compatibility

No new lifecycle column is added to `pull_requests`. The existing `jobs` table is
the source of truth for queue and comment outcomes, avoiding duplicated status.
Existing successful `review_pull` jobs with a stored `commentUrl` project as
Complete. Existing dead jobs project as failed. Pull requests without a matching
job project as not requested even if GitHub itself is merged or closed.

## Testing

Backend tests cover:

- manual POST returns 202 and enqueues instead of running decomposition inline;
- current GitHub head SHA is used and browser input cannot choose it;
- duplicate active requests return one job;
- every job/result state maps to the expected lifecycle state and bucket;
- a succeeded job without `commentUrl` maps to failed;
- a job for an older head SHA does not complete a newer revision;
- lifecycle lookup is batched;
- authorization guards remain attached.

Frontend tests cover:

- 404 renders the creation prompt instead of auto-generating;
- confirm enqueues once and returns to Dashboard;
- cancel returns without creating a job;
- request errors remain visible and can be retried;
- lifecycle states render correct labels and actions;
- cards move from Ready to Review to Complete after polling;
- polling starts only for active states and stops after completion.

End-to-end verification uses a missing-review PR to confirm prompt, HTTP 202,
Dashboard processing state, worker completion, GitHub comment creation, and final
Complete placement.

## Non-Goals

- Changing decomposition prompts or models.
- Replacing the existing Postgres worker queue.
- Treating GitHub merge or close as Folio completion.
- Automatically generating a missing review merely by opening its page.
