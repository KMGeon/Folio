import { and, eq, inArray, notInArray } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type RepositoryInsert, type RepositoryRow, repositories } from "../schema/repositories.js";

export interface RepositorySyncInput {
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
}

export const repositoriesRepo = {
  async create(input: RepositoryInsert, db: Db = getDb()): Promise<RepositoryRow> {
    const [row] = await db.insert(repositories).values(input).returning();
    if (!row) {
      throw new Error("repositoriesRepo.create: insert returned no row");
    }
    return row;
  },

  async getById(id: string, db: Db = getDb()): Promise<RepositoryRow | null> {
    const [row] = await db.select().from(repositories).where(eq(repositories.id, id)).limit(1);
    return row ?? null;
  },

  async getByIdForUpdate(id: string, db: Db = getDb()): Promise<RepositoryRow | null> {
    const [row] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, id))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async getByGithubId(githubRepoId: number, db: Db = getDb()): Promise<RepositoryRow | null> {
    const [row] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.githubRepoId, githubRepoId))
      .limit(1);
    return row ?? null;
  },

  async getByFullName(fullName: string, db: Db = getDb()): Promise<RepositoryRow | null> {
    const [row] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.fullName, fullName))
      .limit(1);
    return row ?? null;
  },

  async listByInstallation(installationId: string, db: Db = getDb()): Promise<RepositoryRow[]> {
    return db.select().from(repositories).where(eq(repositories.installationId, installationId));
  },

  async listByWorkspaceId(workspaceId: string, db: Db = getDb()): Promise<RepositoryRow[]> {
    return db.select().from(repositories).where(eq(repositories.workspaceId, workspaceId));
  },

  async listEnabledByInstallation(
    installationId: string,
    db: Db = getDb(),
  ): Promise<RepositoryRow[]> {
    return db
      .select()
      .from(repositories)
      .where(
        and(eq(repositories.installationId, installationId), eq(repositories.folioEnabled, true)),
      );
  },

  async listByInstallationIds(
    installationIds: string[],
    db: Db = getDb(),
  ): Promise<RepositoryRow[]> {
    if (installationIds.length === 0) {
      return [];
    }
    return db
      .select()
      .from(repositories)
      .where(inArray(repositories.installationId, installationIds));
  },

  async upsertByGithubId(input: RepositoryInsert, db: Db = getDb()): Promise<RepositoryRow> {
    const [row] = await db
      .insert(repositories)
      .values(input)
      .onConflictDoUpdate({
        target: repositories.githubRepoId,
        set: {
          installationId: input.installationId,
          workspaceId: input.workspaceId,
          owner: input.owner,
          name: input.name,
          fullName: input.fullName,
          private: input.private ?? false,
          defaultBranch: input.defaultBranch,
          githubAccessActive: true,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("repositoriesRepo.upsertByGithubId: insert returned no row");
    }
    return row;
  },

  async reconcileInstallationAccess(
    installationId: string,
    workspaceId: string | null,
    inputs: readonly RepositorySyncInput[],
    db: Db = getDb(),
  ): Promise<RepositoryRow[]> {
    return db.transaction(async (tx) => {
      const activeRows: RepositoryRow[] = [];

      for (const input of inputs) {
        activeRows.push(
          await repositoriesRepo.upsertByGithubId(
            {
              ...input,
              installationId,
              // An unresolved workspace must not erase an existing account link.
              workspaceId: workspaceId ?? undefined,
              githubAccessActive: true,
            },
            tx,
          ),
        );
      }

      const githubRepoIds = inputs.map((input) => input.githubRepoId);
      const missingFromGithub =
        githubRepoIds.length > 0
          ? and(
              eq(repositories.installationId, installationId),
              notInArray(repositories.githubRepoId, githubRepoIds),
            )
          : eq(repositories.installationId, installationId);

      await tx
        .update(repositories)
        .set({
          githubAccessActive: false,
          folioEnabled: false,
          updatedAt: new Date(),
        })
        .where(missingFromGithub);

      return activeRows;
    });
  },

  async disconnectInstallation(installationId: string, db: Db = getDb()): Promise<void> {
    await db
      .update(repositories)
      .set({
        githubAccessActive: false,
        folioEnabled: false,
        updatedAt: new Date(),
      })
      .where(eq(repositories.installationId, installationId));
  },

  async setFolioEnabled(id: string, enabled: boolean, db: Db = getDb()): Promise<RepositoryRow> {
    const [row] = await db
      .update(repositories)
      .set({ folioEnabled: enabled, updatedAt: new Date() })
      .where(
        enabled
          ? and(eq(repositories.id, id), eq(repositories.githubAccessActive, true))
          : eq(repositories.id, id),
      )
      .returning();
    if (!row) {
      throw new Error("repositoriesRepo.setFolioEnabled: repository not found or ineligible");
    }
    return row;
  },

  async isFolioEnabledByFullName(fullName: string, db: Db = getDb()): Promise<boolean> {
    const [row] = await db
      .select({
        githubAccessActive: repositories.githubAccessActive,
        folioEnabled: repositories.folioEnabled,
      })
      .from(repositories)
      .where(eq(repositories.fullName, fullName))
      .limit(1);
    return row?.githubAccessActive === true && row.folioEnabled;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(repositories).where(eq(repositories.id, id));
  },
};
