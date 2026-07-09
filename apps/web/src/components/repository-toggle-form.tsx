import { CheckCircle2, CircleOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toggleRepositoryEnabled } from "@/lib/repositories-api";

export function RepositoryToggleForm({
  repositoryId,
  repositoryName,
  enabled,
}: {
  repositoryId: string;
  repositoryName: string;
  enabled: boolean;
}) {
  return (
    <form action={toggleRepositoryEnabled}>
      <input type="hidden" name="repositoryId" value={repositoryId} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      {/* On/Off is a state label: mono, and the active state carries the vivid accent. */}
      <Button
        size="xs"
        variant={enabled ? "secondary" : "outline"}
        aria-label={enabled ? `Disable ${repositoryName}` : `Enable ${repositoryName}`}
        className="font-mono text-[0.7rem] uppercase tracking-[0.12em]"
      >
        {enabled ? (
          <CheckCircle2 className="size-3.5 text-primary" />
        ) : (
          <CircleOff className="size-3.5 text-muted-foreground" />
        )}
        {enabled ? "On" : "Off"}
      </Button>
    </form>
  );
}
