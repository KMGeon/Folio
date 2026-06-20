"use client";

import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <section className="w-full max-w-xl">
        <p className="mb-3 text-xs font-medium uppercase text-destructive">Application error</p>
        <h1 className="text-2xl font-semibold tracking-normal text-foreground">
          요청을 처리하지 못했습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {error.message || "잠시 후 다시 시도해 주세요."}
        </p>
        <Button type="button" className="mt-6" onClick={reset}>
          <RotateCcw className="size-4" />
          다시 시도
        </Button>
      </section>
    </main>
  );
}
