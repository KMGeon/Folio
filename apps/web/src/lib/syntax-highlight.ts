import { type BundledLanguage, codeToTokens } from "shiki";

/*
 * Tokenizes diff code with Shiki so the diff viewer can colour each line.
 * The whole chapter is tokenized as one block (joined with "\n") rather than
 * line-by-line, so multi-line strings/comments/JSX stay correctly coloured;
 * the returned token rows align 1:1 with the input lines.
 */

const THEME = "one-dark-pro";

export interface CodeToken {
  content: string;
  color?: string;
}

export type TokenizedLines = CodeToken[][];

/**
 * Tokenize `lines` for `lang`. Returns one token array per input line, or null
 * if the language grammar can't be loaded (caller falls back to plain text).
 */
export async function tokenizeDiffLines(
  lines: string[],
  lang: string,
): Promise<TokenizedLines | null> {
  try {
    // langFromPath only emits ids Shiki bundles; the cast satisfies the
    // BundledLanguage union without re-listing every id.
    const { tokens } = await codeToTokens(lines.join("\n"), {
      lang: lang as BundledLanguage,
      theme: THEME,
    });
    return tokens.map((row) => row.map((t) => ({ content: t.content, color: t.color })));
  } catch {
    return null;
  }
}
