export interface ChapterCommentInput {
  org: string;
  repo: string;
  number: number;
  webBaseUrl: string;
  commitSha: string;
  chapters: { order: number; title: string }[];
}

function chapterUrl(input: ChapterCommentInput, order: number): string {
  const base = input.webBaseUrl.replace(/\/+$/, "");
  return `${base}/${input.org}/${input.repo}/pull/${input.number}/chapters/${order}`;
}

/** Build the Folio bot comment: an intro line + a numbered chapter table. */
export function buildChapterCommentBody(input: ChapterCommentInput): string {
  const count = input.chapters.length;
  const rows = input.chapters
    .map((c) => `| ${c.order} | [${c.title}](${chapterUrl(input, c.order)}) |`)
    .join("\n");

  return [
    `이 PR은 ${count}개의 Stage로 정리되었습니다. 각 Stage는 변경 파일에서 어떤 작업을 했는지 기준으로 나뉩니다:`,
    "",
    "| | Stage |",
    "| --- | --- |",
    rows,
    "",
    `Folio가 commit \`${input.commitSha}\` 기준으로 Stage를 생성했습니다.`,
  ].join("\n");
}
