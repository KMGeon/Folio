import { z } from "zod";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";

const CursorPayloadSchema = z
  .object({
    v: z.literal(1),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();

export interface AdminPageCursor {
  createdAt: Date;
  id: string;
}

export function encodeAdminPageCursor(value: AdminPageCursor): string {
  return Buffer.from(
    JSON.stringify({ v: 1, createdAt: value.createdAt.toISOString(), id: value.id }),
  ).toString("base64url");
}

export function decodeAdminPageCursor(value?: string): AdminPageCursor | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = CursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new CoreException(ErrorType.InvalidAdminCursor);
  }
}
