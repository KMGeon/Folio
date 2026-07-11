"use client";

import { GitFork, LockKeyhole, Search } from "lucide-react";
import { useState } from "react";

import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api-client";
import { type RepositorySummary, setRepositoryEnabled } from "@/lib/repositories-api";
import { cn } from "@/lib/utils";

export function RepositorySettingsTable({
  initialRepositories,
  disabledReason,
}: {
  initialRepositories: RepositorySummary[];
  disabledReason: string | null;
}) {
  const [repositories, setRepositories] = useState(initialRepositories);
  const [query, setQuery] = useState("");
  const [pendingRepositoryId, setPendingRepositoryId] = useState<string | null>(null);
  const [errorsByRepositoryId, setErrorsByRepositoryId] = useState<Record<string, string>>({});
  const visibleRepositories = repositories
    .filter((repository) => repository.fullName.toLowerCase().includes(query.trim().toLowerCase()))
    .slice()
    .sort(
      (left, right) =>
        Number(right.githubAccessActive) - Number(left.githubAccessActive) ||
        left.fullName.localeCompare(right.fullName),
    );

  const changeRepository = async (repository: RepositorySummary, enabled: boolean) => {
    if (disabledReason || !repository.githubAccessActive || pendingRepositoryId !== null) {
      return;
    }

    setPendingRepositoryId(repository.id);
    setErrorsByRepositoryId((current) => ({ ...current, [repository.id]: "" }));
    try {
      const updated = await setRepositoryEnabled(repository.id, enabled);
      // The response is the confirmed backend state, so failed requests never leave an optimistic value behind.
      setRepositories((current) =>
        current.map((item) => (item.id === repository.id ? updated : item)),
      );
    } catch (error) {
      if (error instanceof ApiError && error.response.error.code === "repository_disconnected") {
        // The conflict is authoritative connectivity state, not merely a failed preference write.
        setRepositories((current) =>
          current.map((item) =>
            item.id === repository.id
              ? { ...item, githubAccessActive: false, folioEnabled: false }
              : item,
          ),
        );
      }
      setErrorsByRepositoryId((current) => ({
        ...current,
        [repository.id]: repositoryMutationError(error),
      }));
    } finally {
      setPendingRepositoryId(null);
    }
  };

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="저장소 검색"
          placeholder="저장소 검색"
          className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </label>

      {initialRepositories.length === 0 ? (
        <EmptyMessage>연결된 저장소가 없습니다.</EmptyMessage>
      ) : visibleRepositories.length === 0 ? (
        <EmptyMessage>검색 결과가 없습니다.</EmptyMessage>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full border-collapse text-left text-xs">
            <caption className="sr-only">저장소별 Folio 리뷰 설정</caption>
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th scope="col" className="h-8 px-3 font-medium">
                  Repository
                </th>
                <th scope="col" className="h-8 px-3 text-right font-medium">
                  Folio review
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRepositories.map((repository) => (
                <RepositoryRow
                  key={repository.id}
                  repository={repository}
                  disabledReason={disabledReason}
                  pending={pendingRepositoryId !== null}
                  error={errorsByRepositoryId[repository.id]}
                  onCheckedChange={(enabled) => void changeRepository(repository, enabled)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RepositoryRow({
  repository,
  disabledReason,
  pending,
  error,
  onCheckedChange,
}: {
  repository: RepositorySummary;
  disabledReason: string | null;
  pending: boolean;
  error?: string;
  onCheckedChange: (enabled: boolean) => void;
}) {
  const disconnected = !repository.githubAccessActive;
  const checked = repository.githubAccessActive && repository.folioEnabled;
  const RepositoryIcon = repository.private ? LockKeyhole : GitFork;
  const disabledReasonId = `repository-${repository.id}-disabled-reason`;
  const mutationErrorId = `repository-${repository.id}-mutation-error`;
  const effectiveDisabledReason = disconnected
    ? "GitHub 앱 연결이 해제되어 Folio 리뷰를 사용할 수 없습니다."
    : disabledReason;
  const describedBy = [
    effectiveDisabledReason ? disabledReasonId : null,
    error ? mutationErrorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      data-repository={repository.fullName}
      className={cn(disconnected && "text-muted-foreground")}
    >
      <td className="h-12 px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <RepositoryIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0">
            <div
              className={cn("truncate text-sm font-medium", !disconnected && "text-foreground/90")}
            >
              {repository.fullName}
            </div>
            <div className="mt-0.5 font-mono text-muted-foreground">
              {disconnected ? "연결 해제됨" : repository.defaultBranch}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-end gap-1">
          <Switch
            checked={checked}
            disabled={disconnected || disabledReason !== null || pending}
            label={
              disconnected
                ? `${repository.fullName} Folio 리뷰 사용 불가: GitHub 앱 연결 해제됨`
                : `${repository.fullName} Folio 리뷰 ${checked ? "끄기" : "켜기"}`
            }
            describedBy={describedBy || undefined}
            onCheckedChange={onCheckedChange}
          />
          {effectiveDisabledReason ? (
            <span id={disabledReasonId} className="max-w-72 text-right text-muted-foreground">
              {effectiveDisabledReason}
            </span>
          ) : null}
          {error ? (
            <span id={mutationErrorId} role="alert" className="text-right text-destructive">
              {error}
            </span>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function repositoryMutationError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.response.error.code === "repository_disconnected") {
      return "GitHub 앱 연결이 해제되었습니다.";
    }
    if (error.response.error.code === "repo_access_denied") {
      return "저장소 설정을 변경하려면 GitHub 관리자 권한이 필요합니다.";
    }
  }
  return "저장소 설정을 변경하지 못했습니다.";
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-3 py-5 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}
