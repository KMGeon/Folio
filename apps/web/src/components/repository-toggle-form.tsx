import { CheckCircle2, CircleOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toggleRepositoryEnabled } from "@/lib/repositories-api";

export function RepositoryToggleForm({
  repositoryId,
  repositoryName,
  enabled,
  disabledReason,
}: {
  repositoryId: string;
  repositoryName: string;
  enabled: boolean;
  disabledReason: string | null;
}) {
  const reasonId = `repository-toggle-${repositoryId}-reason`;

  return (
    <form action={toggleRepositoryEnabled} className="flex flex-col items-end gap-1">
      <input type="hidden" name="repositoryId" value={repositoryId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      {/* On/Off is a state label: mono, and the active state carries the vivid accent. */}
      <Button
        size="xs"
        variant={enabled ? "secondary" : "outline"}
        aria-label={enabled ? `Disable ${repositoryName}` : `Enable ${repositoryName}`}
        aria-describedby={disabledReason ? reasonId : undefined}
        disabled={disabledReason !== null}
        className="font-mono text-[0.7rem] uppercase tracking-[0.12em]"
      >
        {enabled ? (
          <CheckCircle2 className="size-3.5 text-primary" />
        ) : (
          <CircleOff className="size-3.5 text-muted-foreground" />
        )}
        {enabled ? "On" : "Off"}
      </Button>
      {disabledReason ? (
        <span id={reasonId} className="max-w-56 text-right text-[0.65rem] text-muted-foreground">
          {disabledReason}
        </span>
      ) : null}
    </form>
  );
}
