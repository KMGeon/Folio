import { z } from "zod";
import { enumFromConst } from "./common.js";

export const FOCUS_AREA_TYPE = {
  SECURITY: "security",
  BREAKING_CHANGE: "breaking-change",
  HIGH_COMPLEXITY: "high-complexity",
  DATA_INTEGRITY: "data-integrity",
  NEW_PATTERN: "new-pattern",
  ARCHITECTURE: "architecture",
  PERFORMANCE: "performance",
  TESTING_GAP: "testing-gap",
} as const;
export type FocusAreaType = (typeof FOCUS_AREA_TYPE)[keyof typeof FOCUS_AREA_TYPE];

export const FOCUS_AREA_SEVERITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  INFO: "info",
} as const;
export type FocusAreaSeverity = (typeof FOCUS_AREA_SEVERITY)[keyof typeof FOCUS_AREA_SEVERITY];

export const COMPLEXITY_LEVEL = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  VERY_HIGH: "very-high",
} as const;
export type ComplexityLevel = (typeof COMPLEXITY_LEVEL)[keyof typeof COMPLEXITY_LEVEL];

export const PrologueKeyChangeSchema = z.object({
  summary: z.string(),
  description: z.string(),
});
export type PrologueKeyChange = z.infer<typeof PrologueKeyChangeSchema>;

export const FocusAreaSchema = z.object({
  type: enumFromConst(FOCUS_AREA_TYPE),
  severity: enumFromConst(FOCUS_AREA_SEVERITY),
  title: z.string(),
  description: z.string(),
  locations: z.array(z.string()),
});
export type FocusArea = z.infer<typeof FocusAreaSchema>;

export const ComplexitySchema = z.object({
  level: enumFromConst(COMPLEXITY_LEVEL),
  reasoning: z.string(),
});
export type Complexity = z.infer<typeof ComplexitySchema>;

export const PrologueSchema = z.object({
  /**
   * Non-engineer TL;DR (1–2 Korean sentences): what this PR handles and why it
   * matters, with no file paths or code-level jargon. Null when the model
   * cannot infer a product-level summary. Older stored prologues omit it.
   */
  plainSummary: z.string().nullable().default(null),
  motivation: z.string().nullable(),
  outcome: z.string().nullable(),
  /** Mermaid diagram source (without code fences), or null when prose alone is clear. */
  diagram: z.string().nullable().default(null),
  keyChanges: z.array(PrologueKeyChangeSchema),
  focusAreas: z.array(FocusAreaSchema),
  complexity: ComplexitySchema,
});
export type Prologue = z.infer<typeof PrologueSchema>;
