import { z } from "zod";
import { IsoDateTimeSchema, enumFromConst } from "./common.js";

export const ACCOUNT_TYPE = {
  USER: "User",
  ORGANIZATION: "Organization",
} as const;
export type AccountType = (typeof ACCOUNT_TYPE)[keyof typeof ACCOUNT_TYPE];

export const InstallationSchema = z.object({
  id: z.string(),
  githubInstallationId: z.number().int(),
  accountLogin: z.string(),
  accountType: enumFromConst(ACCOUNT_TYPE),
  suspendedAt: IsoDateTimeSchema.nullable(),
});
export type Installation = z.infer<typeof InstallationSchema>;
