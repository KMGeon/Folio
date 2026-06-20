import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  githubUserId: z.number().int(),
  login: z.string(),
  avatarUrl: z.string(),
  email: z.string().email().optional(),
});
export type User = z.infer<typeof UserSchema>;
