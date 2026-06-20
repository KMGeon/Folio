import { z } from "zod";

/**
 * Helper to build a `z.enum` from a `const` object of string values, mirroring
 * Zod v3's `z.enum` needs a non-empty
 * readonly string tuple, so we extract the values here.
 */
export function enumFromConst<T extends Record<string, string>>(
  obj: T,
): z.ZodEnum<[T[keyof T], ...T[keyof T][]]> {
  const values = Object.values(obj) as [T[keyof T], ...T[keyof T][]];
  return z.enum(values);
}

/** A branded `string` id helper so different id kinds don't get mixed up structurally. */
export function brandedId<B extends string>(_brand: B) {
  return z.string().min(1).brand<B>();
}

/** Full 40-char hex git commit SHA. */
export const ShaSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "Expected a full 40-character commit SHA");
export type Sha = z.infer<typeof ShaSchema>;

/** Abbreviated git SHA (7–40 hex chars). */
export const ShortShaSchema = z
  .string()
  .regex(/^[0-9a-f]{7,40}$/, "Expected an abbreviated commit SHA (7–40 hex chars)");
export type ShortSha = z.infer<typeof ShortShaSchema>;

/** ISO-8601 date-time string (e.g. `2026-06-20T12:00:00.000Z`). */
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/**
 * LexoRank ordering key for `@kayron013/lexorank`. Kept as a non-empty string
 * here so this package stays free of runtime deps beyond zod.
 */
// TODO(F3): if lexorank-key validation is desired, validate against
// `@kayron013/lexorank` format once that dep is introduced downstream.
export const LexoRankSchema = z.string().min(1).brand<"LexoRank">();
export type LexoRank = z.infer<typeof LexoRankSchema>;
