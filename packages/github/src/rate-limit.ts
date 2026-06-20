import { RequestError } from "@octokit/request-error";

/** Thrown after retries are exhausted on a rate-limited / abuse-limited call. */
export class RateLimitError extends Error {
  readonly resetAt: Date;
  constructor(message: string, resetAt: Date) {
    super(message);
    this.name = "RateLimitError";
    this.resetAt = resetAt;
  }
}

export interface RateLimitRetryOptions {
  /** Total attempts including the first try. Default 4. */
  maxAttempts?: number;
  /** Base for exponential backoff fallback (ms). Default 1000. */
  baseDelayMs?: number;
  /** Hard ceiling on any single wait (ms). Default 60_000. */
  maxDelayMs?: number;
  /** Injected sleep for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable clock (ms) for deterministic tests. */
  now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Octokit response headers carry `string | number | undefined` values. */
type ResponseHeaderMap = Record<string, string | number | undefined>;

interface RetryableError {
  status?: number;
  response?: { headers?: ResponseHeaderMap };
}

function asRetryable(err: unknown): RetryableError | null {
  if (err instanceof RequestError) {
    return { status: err.status, response: { headers: err.response?.headers } };
  }
  if (typeof err === "object" && err !== null) {
    const e = err as RetryableError;
    if (typeof e.status === "number") {
      return e;
    }
  }
  return null;
}

function isRateLimited(status: number | undefined): boolean {
  return status === 403 || status === 429;
}

/**
 * Compute how long to wait (ms) honoring, in precedence order:
 *  1. `Retry-After` (seconds) — GitHub's explicit instruction for abuse limits,
 *  2. `x-ratelimit-reset` (epoch seconds) — primary rate-limit window reset,
 *  3. exponential backoff fallback.
 * Returns the reset instant too, for surfacing on {@link RateLimitError}.
 */
function computeDelay(
  headers: ResponseHeaderMap | undefined,
  attempt: number,
  opts: Required<Pick<RateLimitRetryOptions, "baseDelayMs" | "maxDelayMs">>,
  nowMs: number,
): { delayMs: number; resetAt: Date } {
  const retryAfter = headers?.["retry-after"];
  if (retryAfter !== undefined) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs) && secs >= 0) {
      const delayMs = Math.min(secs * 1000, opts.maxDelayMs);
      return { delayMs, resetAt: new Date(nowMs + secs * 1000) };
    }
  }

  const reset = headers?.["x-ratelimit-reset"];
  if (reset !== undefined) {
    const epochSec = Number(reset);
    if (Number.isFinite(epochSec)) {
      const resetMs = epochSec * 1000;
      const delayMs = Math.max(0, Math.min(resetMs - nowMs, opts.maxDelayMs));
      return { delayMs, resetAt: new Date(resetMs) };
    }
  }

  const backoff = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs);
  return { delayMs: backoff, resetAt: new Date(nowMs + backoff) };
}

/**
 * Run `fn` (an Octokit call), retrying on 403/429 rate-limit responses with a
 * bounded, header-aware backoff. After `maxAttempts` it throws
 * {@link RateLimitError}. Non-rate-limit errors propagate immediately.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options: RateLimitRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 60_000;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;

  let lastResetAt = new Date(now());
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const retryable = asRetryable(err);
      if (!retryable || !isRateLimited(retryable.status)) {
        throw err;
      }

      const { delayMs, resetAt } = computeDelay(
        retryable.response?.headers,
        attempt,
        { baseDelayMs, maxDelayMs },
        now(),
      );
      lastResetAt = resetAt;
      if (attempt === maxAttempts - 1) {
        break;
      }
      await sleep(delayMs);
    }
  }

  throw new RateLimitError(
    `GitHub rate limit not cleared after ${maxAttempts} attempts`,
    lastResetAt,
  );
}
