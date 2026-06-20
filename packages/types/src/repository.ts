import { z } from "zod";

export const RepositorySchema = z.object({
  id: z.string(),
  installationId: z.string(),
  githubRepoId: z.number().int(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
});
export type Repository = z.infer<typeof RepositorySchema>;
