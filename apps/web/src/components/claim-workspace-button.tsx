"use client";

import { Loader2, PlugZap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiRequest } from "@/lib/api-client";

import { Button } from "./ui/button";

export function ClaimWorkspaceButton({ installationId }: { installationId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const claim = async () => {
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      await apiRequest("/api/v1/workspaces/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installationId }),
      });
      router.push("/settings/workspaces");
    } catch {
      setError("워크스페이스 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-8 space-y-2">
      <Button type="button" disabled={pending} onClick={claim}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
        {pending ? "연결 중…" : "워크스페이스 연결"}
      </Button>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
