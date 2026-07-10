import { ACCOUNT_TYPE, GLOBAL_STATUS } from "@folio/types";
import { eq } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { workspacesRepo } from "../repos/workspaces.js";
import { installations } from "../schema/installations.js";
import { repositories } from "../schema/repositories.js";
import { USER_STATUS, users } from "../schema/users.js";

export interface BackfillDeps {
  // The GitHub App API identifies installations by their external numeric id.
  resolveAccountId: (githubInstallationId: number) => Promise<number>;
}

/**
 * Derives workspaces from installations, links repositories, and maps the
 * legacy approval state. Safe to resume or re-run after a partial failure.
 */
export async function backfillWorkspaces(db: Db = getDb(), deps?: BackfillDeps): Promise<void> {
  const allInstallations = await db.select().from(installations);

  for (const installation of allInstallations) {
    const githubAccountId =
      installation.githubAccountId ??
      (deps ? await deps.resolveAccountId(installation.githubInstallationId) : null);

    if (githubAccountId === null) {
      throw new Error(`backfillWorkspaces: no account id for installation ${installation.id}`);
    }

    const workspace = await workspacesRepo.upsertByGithubAccountId(
      {
        githubAccountId,
        accountLogin: installation.accountLogin,
        accountType:
          installation.accountType === ACCOUNT_TYPE.ORGANIZATION
            ? ACCOUNT_TYPE.ORGANIZATION
            : ACCOUNT_TYPE.USER,
      },
      db,
    );

    if (installation.githubAccountId === null) {
      await db
        .update(installations)
        .set({ githubAccountId, updatedAt: new Date() })
        .where(eq(installations.id, installation.id));
    }

    await db
      .update(repositories)
      .set({ workspaceId: workspace.id, updatedAt: new Date() })
      .where(eq(repositories.installationId, installation.id));
  }

  // Preserve the legacy approval decision in the new global lifecycle.
  await db
    .update(users)
    .set({ globalStatus: GLOBAL_STATUS.ACTIVE, updatedAt: new Date() })
    .where(eq(users.status, USER_STATUS.APPROVED));
}
