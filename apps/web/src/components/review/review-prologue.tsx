"use client";

import { MessageSquare, MoreHorizontal } from "lucide-react";
import { useState } from "react";

import type { ReviewIssueComment, ReviewPrMeta } from "@/lib/review-api";
import { cn } from "@/lib/utils";

type PrologueTab = "description" | "comments";

export function ReviewPrologue({
  pr,
  comments,
}: {
  pr: ReviewPrMeta;
  comments: ReviewIssueComment[];
}) {
  const [tab, setTab] = useState<PrologueTab>("description");

  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="font-mono text-muted-foreground text-[0.7rem] uppercase tracking-[0.18em]">
          Prologue
        </span>
        <div className="flex rounded-md bg-muted/60 p-0.5">
          <PrologueTabButton
            active={tab === "description"}
            label="Description"
            onClick={() => setTab("description")}
          />
          <PrologueTabButton
            active={tab === "comments"}
            label={`Comments ${comments.length}`}
            onClick={() => setTab("comments")}
          />
        </div>
        <MoreHorizontal className="ml-auto size-4 text-muted-foreground" />
      </div>

      {tab === "description" ? (
        <ConversationCard author={pr.author} createdLabel="PR description">
          <MarkdownText text={pr.body || "PR 설명이 없습니다."} />
        </ConversationCard>
      ) : (
        <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
          {comments.length > 0 ? (
            comments.map((comment) => (
              <ConversationCard
                key={comment.id}
                author={comment.author}
                avatarUrl={comment.avatarUrl}
                createdLabel={formatDate(comment.createdAt)}
                href={comment.htmlUrl}
              >
                <MarkdownText text={comment.body || "(빈 댓글)"} />
              </ConversationCard>
            ))
          ) : (
            <div className="rounded-lg border bg-card p-6 text-muted-foreground text-sm">
              아직 PR 댓글이 없습니다.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function PrologueTabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 font-medium text-xs uppercase tracking-wide transition-colors",
        active ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function ConversationCard({
  author,
  avatarUrl,
  createdLabel,
  href,
  children,
}: {
  author: string;
  avatarUrl?: string;
  createdLabel: string;
  href?: string;
  children: React.ReactNode;
}) {
  const imageUrl = avatarUrl || `https://github.com/${author}.png?size=48`;
  return (
    <article className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <img
          src={imageUrl}
          alt={author}
          width={24}
          height={24}
          referrerPolicy="no-referrer"
          className="size-6 rounded-full border"
        />
        <span className="font-semibold">{author}</span>
        <MessageSquare className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">{createdLabel}</span>
      </div>
      {children}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
        >
          GitHub에서 보기
        </a>
      ) : null}
    </article>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/u);
  const blocks = toMarkdownBlocks(lines);
  return (
    <div className="space-y-2 text-sm leading-6 text-foreground/90">
      {blocks.map((block, index) => {
        const key = `${index}-${block.lines.join("\n")}`;
        if (block.type === "spacer") {
          return <div key={key} className="h-1" />;
        }
        if (block.type === "table") {
          return <MarkdownTable key={key} lines={block.lines} />;
        }

        const line = block.lines[0] ?? "";
        if (line.startsWith("### ")) {
          return (
            <h4 key={key} className="pt-2 font-serif text-lg text-foreground">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={key} className="border-b pb-2 font-serif text-xl text-foreground">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h2 key={key} className="border-b pb-2 font-serif text-2xl text-foreground">
              {line.slice(2)}
            </h2>
          );
        }
        if (/^\s*[-*]\s+/u.test(line)) {
          return (
            <p key={key} className="pl-4 before:mr-2 before:content-['•']">
              {renderInlineMarkdown(line.replace(/^\s*[-*]\s+/u, ""), key)}
            </p>
          );
        }
        return <p key={key}>{renderInlineMarkdown(line, key)}</p>;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { type: "line"; lines: string[] }
  | { type: "spacer"; lines: string[] }
  | { type: "table"; lines: string[] };

function toMarkdownBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    if (!line.trim()) {
      blocks.push({ type: "spacer", lines: [line] });
      index += 1;
      continue;
    }
    if (isTableRow(line) && isTableSeparator(next)) {
      const tableLines = [line, next];
      index += 2;
      while (index < lines.length && isTableRow(lines[index] ?? "")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "table", lines: tableLines });
      continue;
    }
    blocks.push({ type: "line", lines: [line] });
    index += 1;
  }
  return blocks;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const header = parseTableCells(lines[0] ?? "");
  const rows = lines.slice(2).map(parseTableCells);
  return (
    <div className="overflow-x-auto py-1">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th
                key={`${cell}-${index}`}
                className="border border-border bg-muted/35 px-3 py-2 font-semibold"
              >
                {renderInlineMarkdown(cell, `th-${index}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join("|")}`}>
              {header.map((_, cellIndex) => (
                <td
                  key={`${rowIndex}-${cellIndex}`}
                  className="border border-border px-3 py-2 align-top"
                >
                  {renderInlineMarkdown(row[cellIndex] ?? "", `td-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/u.test(line);
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInlineMarkdown(line: string, keyPrefix: string) {
  const parts = line.split(/(`[^`]+`|\[[^\]]+\]\([^)]+\))/u);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={`${keyPrefix}-${index}`} className="rounded bg-muted px-1.5 py-0.5 font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(part);
    if (link) {
      return (
        <a
          key={`${keyPrefix}-${index}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          {link[1]}
        </a>
      );
    }
    return <span key={`${keyPrefix}-${index}`}>{part}</span>;
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
