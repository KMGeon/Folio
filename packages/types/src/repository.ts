import { z } from "zod";
import { enumFromConst } from "./common.js";

export const REPOSITORY_PRIORITY = {
  HIGH: "high",
  NORMAL: "normal",
  LOW: "low",
} as const;
export type RepositoryPriority = (typeof REPOSITORY_PRIORITY)[keyof typeof REPOSITORY_PRIORITY];
export const RepositoryPrioritySchema = enumFromConst(REPOSITORY_PRIORITY);

export const RepositorySchema = z.object({
  id: z.string(),
  installationId: z.string(),
  githubRepoId: z.number().int(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  private: z.boolean(),
  defaultBranch: z.string(),
  folioEnabled: z.boolean(),
  githubAccessActive: z.boolean(),
  aiReplyEnabled: z.boolean(),
  priority: RepositoryPrioritySchema,
});
export type Repository = z.infer<typeof RepositorySchema>;
