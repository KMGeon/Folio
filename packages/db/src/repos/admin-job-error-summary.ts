const MAX_SUMMARY_LENGTH = 200;

/**
 * Admin may only see a length-capped, scrubbed error summary — never raw lastError
 * which may contain tokens or path secrets from worker failures.
 */
export function summarizeAdminJobError(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  let text = raw
    .replace(/\b(ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return null;
  }
  if (text.length > MAX_SUMMARY_LENGTH) {
    text = `${text.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
  }
  return text;
}

export function isAdminJobDistressed(
  status: string,
  runAfter: Date,
  now: Date = new Date(),
): boolean {
  if (status === "dead") {
    return true;
  }
  // Failed jobs past runAfter are overdue for reclaim — not a worker health claim.
  return status === "failed" && runAfter.getTime() < now.getTime();
}
