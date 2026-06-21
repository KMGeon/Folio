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
        <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
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
  createdLabel,
  href,
  children,
}: {
  author: string;
  createdLabel: string;
  href?: string;
  children: React.ReactNode;
}) {
  const content = (
    <article className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm">
        <img
          src={`https://github.com/${author}.png?size=48`}
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
    </article>
  );

  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block hover:border-primary/40">
      {content}
    </a>
  ) : (
    content
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/u);
  return (
    <div className="space-y-2 text-sm leading-6 text-foreground/90">
      {lines.map((line, index) => {
        const key = `${index}-${line}`;
        if (!line.trim()) {
          return <div key={key} className="h-1" />;
        }
        if (line.startsWith("### ")) {
          return (
            <h4 key={key} className="pt-2 font-semibold text-base">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith("## ")) {
          return (
            <h3 key={key} className="border-b pb-2 font-semibold text-xl">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <h2 key={key} className="border-b pb-2 font-semibold text-xl">
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

function renderInlineMarkdown(line: string, keyPrefix: string) {
  const parts = line.split(/(`[^`]+`)/u);
  return parts.map((part, index) =>
    part.startsWith("`") && part.endsWith("`") ? (
      <code key={`${keyPrefix}-${index}`} className="rounded bg-muted px-1.5 py-0.5 font-mono">
        {part.slice(1, -1)}
      </code>
    ) : (
      <span key={`${keyPrefix}-${index}`}>{part}</span>
    ),
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}
