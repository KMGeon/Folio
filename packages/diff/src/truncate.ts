/**
 * Maximum number of characters of formatted diff we feed the LLM. Bounds the
 * Claude tool-use prompt; anything past this is dropped and reported.
 */
export const MAX_DIFF_CHARS = 200_000;

export interface TruncateResult {
  text: string;
  truncated: boolean;
  droppedChars: number;
}

/**
 * Bound `text` to `max` characters. Returns the (possibly clipped) text plus
 * whether it was truncated and how many characters were dropped.
 */
export function truncateForLlm(text: string, max: number = MAX_DIFF_CHARS): TruncateResult {
  if (text.length <= max) {
    return { text, truncated: false, droppedChars: 0 };
  }
  return {
    text: text.slice(0, max),
    truncated: true,
    droppedChars: text.length - max,
  };
}
