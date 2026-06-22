import { and, eq, inArray } from "drizzle-orm";
import { type Db, getDb } from "../client.js";
import { type RepositoryInsert, type RepositoryRow, repositories } from "../schema/repositories.js";

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
          owner: input.owner,
          name: input.name,
          fullName: input.fullName,
          private: input.private ?? false,
          defaultBranch: input.defaultBranch,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!row) {
      throw new Error("repositoriesRepo.upsertByGithubId: insert returned no row");
    }
    return row;
  },

  async setFolioEnabled(id: string, enabled: boolean, db: Db = getDb()): Promise<RepositoryRow> {
    const [row] = await db
      .update(repositories)
      .set({ folioEnabled: enabled, updatedAt: new Date() })
      .where(eq(repositories.id, id))
      .returning();
    if (!row) {
      throw new Error("repositoriesRepo.setFolioEnabled: repository not found");
    }
    return row;
  },

  async isFolioEnabledByFullName(fullName: string, db: Db = getDb()): Promise<boolean> {
    const [row] = await db
      .select({ folioEnabled: repositories.folioEnabled })
      .from(repositories)
      .where(eq(repositories.fullName, fullName))
      .limit(1);
    return row?.folioEnabled ?? false;
  },

  async delete(id: string, db: Db = getDb()): Promise<void> {
    await db.delete(repositories).where(eq(repositories.id, id));
  },
};
