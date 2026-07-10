"use client";

import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-xl">
        {/* Vivid destructive eyebrow: the error state is the one place color speaks. */}
        <p className="mb-4 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-destructive">
          Application error
        </p>
        <h1 className="font-serif text-3xl font-normal leading-[1.1] tracking-tight text-foreground md:text-[2.75rem]">
          요청을 처리하지 못했습니다
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          {/* Server/runtime error details stay in logs; the client gets only recovery guidance. */}
          잠시 후 다시 시도해 주세요.
        </p>
        <Button type="button" className="mt-8" onClick={reset}>
          <RotateCcw className="size-4" />
          다시 시도
        </Button>
      </section>
    </main>
  );
}
