// The `emit_chapters` structured-output schema. Its `input_schema` is a JSON
// Schema mirroring the strict Zod emit shape in @folio/types
// (`ChapterEmitSchema` + `PrologueSchema`); it is passed to Codex as the turn's
// `outputSchema` so the model is constrained to emit JSON, and the Zod parser in
// `schema.ts` re-validates on the way back.

/** Logical name of the structured payload the model must emit. */
export const EMIT_CHAPTERS_TOOL_NAME = "emit_chapters";

const lineRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["filePath", "side", "startLine", "endLine"],
  properties: {
    filePath: { type: "string", minLength: 1 },
    side: {
      type: "string",
      enum: ["additions", "deletions"],
      description:
        "Read line numbers from the formatted hunk columns: 'deletions' uses the LEFT (old) column, 'additions' uses the RIGHT (new) column.",
    },
    startLine: { type: "integer", minimum: 1 },
    endLine: {
      type: "integer",
      minimum: 1,
      description: "Must be >= startLine.",
    },
  },
} as const;

const keyChangeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["content", "lineRefs"],
  properties: {
    content: {
      type: "string",
      minLength: 1,
      description:
        "A judgment-call QUESTION only a human reviewer can answer. Never a changelog item or a correctness check a linter/CI catches.",
    },
    lineRefs: {
      type: "array",
      minItems: 1,
      items: lineRefSchema,
    },
  },
} as const;

const hunkRefSchema = {
  type: "object",
  additionalProperties: false,
  required: ["filePath", "oldStart"],
  properties: {
    filePath: {
      type: "string",
      minLength: 1,
      description: "The exact filePath from the hunk header.",
    },
    oldStart: {
      type: "integer",
      minimum: 0,
      description: "The exact oldStart integer from the hunk header.",
    },
  },
} as const;

const chapterSchema = {
  type: "object",
  additionalProperties: false,
  required: ["id", "order", "title", "summary", "hunkRefs", "keyChanges"],
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: 'Unique within the run, e.g. "chapter-1".',
    },
    order: {
      type: "integer",
      minimum: 1,
      description: "1-indexed reading order.",
    },
    title: {
      type: "string",
      minLength: 1,
      description: "Action-oriented verb phrase, max 8 words. No filler.",
    },
    summary: {
      type: "string",
      minLength: 1,
      description: "2-3 sentences, impact-led. Talk like a coworker.",
    },
    hunkRefs: {
      type: "array",
      items: hunkRefSchema,
      description:
        "Every hunk in this chapter, by (filePath, oldStart). Each diff hunk must appear in exactly one chapter across the whole run.",
    },
    keyChanges: {
      type: "array",
      items: keyChangeSchema,
      description: "Judgment-call questions only. Empty array when none.",
    },
  },
} as const;

const focusAreaSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "severity", "title", "description", "locations"],
  properties: {
    type: {
      type: "string",
      enum: [
        "security",
        "breaking-change",
        "high-complexity",
        "data-integrity",
        "new-pattern",
        "architecture",
        "performance",
        "testing-gap",
      ],
    },
    severity: {
      type: "string",
      enum: ["critical", "high", "medium", "info"],
    },
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    locations: { type: "array", items: { type: "string" } },
  },
} as const;

const prologueKeyChangeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "description"],
  properties: {
    summary: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
  },
} as const;

const prologueSchema = {
  type: "object",
  additionalProperties: false,
  // Strict structured output: every property must be listed in `required`; optional
  // values (diagram) stay expressible via a nullable type rather than omission.
  required: ["motivation", "outcome", "diagram", "keyChanges", "focusAreas", "complexity"],
  properties: {
    motivation: {
      type: ["string", "null"],
      description: "One non-engineer sentence, or null when not obvious.",
    },
    outcome: { type: ["string", "null"] },
    diagram: {
      type: ["string", "null"],
      description: "Mermaid source (no fences) or null. Most changes: null.",
    },
    keyChanges: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: prologueKeyChangeSchema,
    },
    focusAreas: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: focusAreaSchema,
    },
    complexity: {
      type: "object",
      additionalProperties: false,
      required: ["level", "reasoning"],
      properties: {
        level: {
          type: "string",
          enum: ["low", "medium", "high", "very-high"],
        },
        reasoning: { type: "string", minLength: 1 },
      },
    },
  },
} as const;

/**
 * The structured-output contract. Passed as the Codex turn's `outputSchema` so the
 * model returns this JSON shape rather than prose.
 */
export const emitChaptersTool = {
  name: EMIT_CHAPTERS_TOOL_NAME,
  description:
    "Emit the ordered chapters and PR-level prologue that decompose this diff. " +
    "Every diff hunk must be assigned to exactly one chapter via hunkRefs.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    // Strict structured output requires every property in `required`; the live model
    // always emits a prologue. The Zod parser keeps it optional for stubbed callers.
    required: ["chapters", "prologue"],
    properties: {
      chapters: {
        type: "array",
        minItems: 1,
        items: chapterSchema,
      },
      prologue: prologueSchema,
    },
  },
} as const;

export type EmitChaptersTool = typeof emitChaptersTool;
