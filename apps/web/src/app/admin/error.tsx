"use client";

import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 text-destructive" />
        <div>
          <h1 className="text-sm font-semibold">관리자 화면을 불러오지 못했습니다.</h1>
          <p className="mt-1 text-xs text-muted-foreground">잠시 후 다시 시도해 주세요.</p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="mt-4"
            onClick={() => reset()}
          >
            다시 시도
          </Button>
        </div>
      </div>
    </div>
  );
}
