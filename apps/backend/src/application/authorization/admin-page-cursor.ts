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
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error("Invalid base64url alphabet");
    }
    const decoded = Buffer.from(value, "base64url");
    // Re-encoding rejects non-canonical encodings that Buffer would otherwise tolerate.
    if (decoded.toString("base64url") !== value) {
      throw new Error("Non-canonical base64url encoding");
    }
    const parsed = CursorPayloadSchema.parse(JSON.parse(decoded.toString("utf8")));
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new CoreException(ErrorType.InvalidAdminCursor);
  }
}
