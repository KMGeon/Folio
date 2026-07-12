"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  type ReviewAnalysisStatus,
  type ReviewGenerationResult,
  createReview,
  fetchReviewGeneration,
} from "@/lib/review-api";

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
  const [analysisStatus, setAnalysisStatus] = useState<ReviewAnalysisStatus | "loading">("loading");

  useEffect(() => {
    let cancelled = false;
    void fetchReviewGeneration(org, repo, number)
      .then((result) => {
        if (!cancelled) {
          setAnalysisStatus(result.analysisStatus);
        }
      })
      .catch(() => {
        // Fall back to the create CTA when status is unavailable.
        if (!cancelled) {
          setAnalysisStatus("not_requested");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [org, repo, number]);

  const inFlight = analysisStatus === "processing" || analysisStatus === "retrying";

  async function confirm() {
    if (submitting || inFlight) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result: ReviewGenerationResult = await createReview(org, repo, number);
      if (result.deduplicated || isInFlightStatus(result.analysisStatus)) {
        setAnalysisStatus(
          result.analysisStatus === "not_requested" ? "processing" : result.analysisStatus,
        );
        setSubmitting(false);
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("리뷰 생성 요청을 큐에 넣지 못했습니다. 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }

  if (analysisStatus === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted-foreground">생성 상태를 확인하는 중…</p>
      </div>
    );
  }

  if (inFlight) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <section className="w-full max-w-lg rounded-lg border bg-card p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Review in progress
          </p>
          <h1 className="mt-3 text-xl font-medium">리뷰가 이미 생성 중입니다</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {org}/{repo}#{number}에 대한 worker 작업이 이미 큐에 있거나 실행 중입니다. 같은 head에
            대해 중복 요청을 넣지 않습니다. 진행 상태는 Dashboard에서 확인할 수 있습니다.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" onClick={() => router.replace("/dashboard")}>
              Dashboard로 이동
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <section className="w-full max-w-lg rounded-lg border bg-card p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          리뷰 없음
        </p>
        <h1 className="mt-3 text-xl font-medium">Folio 리뷰가 없습니다</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {org}/{repo}#{number}의 리뷰를 생성할까요? 요청은 worker에서 처리되며 진행 상태는
          Dashboard에서 확인할 수 있습니다. 이미 처리 중인 작업이 있으면 중복으로 넣지 않습니다.
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

function isInFlightStatus(status: ReviewAnalysisStatus): boolean {
  return status === "processing" || status === "retrying";
}
