import type { AdminWorkspaceInstallationState } from "@folio/types";
import { and, eq, exists, isNotNull, isNull, not, notExists } from "drizzle-orm";
import type { Db } from "../client.js";
import { installations } from "../schema/installations.js";
import { workspaces } from "../schema/workspaces.js";

export function installationStateCondition(
  state: AdminWorkspaceInstallationState | undefined,
  db: Db,
) {
  if (!state) {
    return undefined;
  }
  const suspended = exists(
    db
      .select({ id: installations.id })
      .from(installations)
      .where(
        and(
          eq(installations.githubAccountId, workspaces.githubAccountId),
          isNotNull(installations.suspendedAt),
        ),
      ),
  );
  const active = exists(
    db
      .select({ id: installations.id })
      .from(installations)
      .where(
        and(
          eq(installations.githubAccountId, workspaces.githubAccountId),
          isNull(installations.suspendedAt),
        ),
      ),
  );
  if (state === "none") {
    return notExists(
      db
        .select({ id: installations.id })
        .from(installations)
        .where(eq(installations.githubAccountId, workspaces.githubAccountId)),
    );
  }
  if (state === "active") {
    return and(active, not(suspended));
  }
  if (state === "suspended") {
    return and(suspended, not(active));
  }
  return and(suspended, active);
}

export function stateForInstallations(
  rows: { suspendedAt: Date | null }[],
): AdminWorkspaceInstallationState {
  if (!rows.length) {
    return "none";
  }
  const hasSuspended = rows.some((row) => row.suspendedAt !== null);
  const hasActive = rows.some((row) => row.suspendedAt === null);
  if (hasSuspended && hasActive) {
    return "mixed";
  }
  return hasSuspended ? "suspended" : "active";
}
