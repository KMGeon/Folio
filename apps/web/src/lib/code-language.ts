/*
 * Maps a file path to a Shiki language id. Diff lines carry no language, so the
 * chapter's file extension is the only signal. Returns null for prose/unknown
 * files so the caller can fall back to the markdown line highlighter.
 */

const EXTENSION_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  py: "python",
  rb: "ruby",
  php: "php",
  swift: "swift",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  html: "html",
  css: "css",
  scss: "scss",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  dockerfile: "docker",
  vue: "vue",
  svelte: "svelte",
};

const FILENAME_TO_LANG: Record<string, string> = {
  dockerfile: "docker",
  makefile: "make",
};

/** Resolve a Shiki language id from a file path, or null when unknown/prose. */
export function langFromPath(path: string): string | null {
  const file = path.split("/").pop()?.toLowerCase() ?? "";
  if (FILENAME_TO_LANG[file]) {
    return FILENAME_TO_LANG[file];
  }
  const ext = file.includes(".") ? file.slice(file.lastIndexOf(".") + 1) : "";
  return EXTENSION_TO_LANG[ext] ?? null;
}
