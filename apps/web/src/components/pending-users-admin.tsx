"use client";

import { Check, Clock3 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { approvePendingUser, type PendingUser } from "@/lib/auth";

export function PendingUsersAdmin({ initialUsers }: { initialUsers: PendingUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const approve = (id: string) => {
    setApprovingId(id);
    setError(null);
    startTransition(async () => {
      try {
        await approvePendingUser(id);
        setUsers((current) => current.filter((user) => user.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "승인에 실패했습니다.");
      } finally {
        setApprovingId(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      {users.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          대기 중인 가입 요청이 없습니다.
        </div>
      ) : (
        users.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-3 rounded-md border bg-background/35 px-3 py-2"
          >
            <img
              src={user.avatarUrl}
              alt={user.login}
              width={32}
              height={32}
              referrerPolicy="no-referrer"
              className="size-8 rounded-full border"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.login}</div>
              <div className="truncate text-xs text-muted-foreground">
                {user.email ?? "GitHub email 없음"}
              </div>
            </div>
            <Button
              type="button"
              size="xs"
              onClick={() => approve(user.id)}
              disabled={isPending && approvingId === user.id}
            >
              <Check className="size-4" />
              승인
            </Button>
          </div>
        ))
      )}

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
