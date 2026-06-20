import { z } from "zod";
import { IsoDateTimeSchema } from "./common.js";

export const SessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  expiresAt: IsoDateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;
