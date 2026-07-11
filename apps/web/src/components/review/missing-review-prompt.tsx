"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { createReview } from "@/lib/review-api";

export function MissingReviewPrompt({
  org,
  repo,
  number,
}: {
  org: string;
  repo: string;
  number: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createReview(org, repo, number);
      router.replace("/dashboard");
    } catch {
      setError("리뷰 생성 요청을 큐에 넣지 못했습니다. 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="w-full max-w-lg rounded-lg border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Missing review
        </p>
        <h1 className="mt-3 text-xl font-medium">Folio 리뷰가 없습니다</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {org}/{repo}#{number}의 리뷰를 생성할까요? 요청은 worker에서 처리되며 진행 상태는
          Dashboard에서 확인할 수 있습니다.
        </p>
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => router.replace("/dashboard")}>
            취소
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void confirm()}>
            {submitting ? "요청 중…" : "리뷰 생성"}
          </Button>
        </div>
      </section>
    </div>
  );
}
