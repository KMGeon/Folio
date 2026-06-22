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
      <Button
        size="xs"
        variant={enabled ? "secondary" : "outline"}
        aria-label={enabled ? `Disable ${repositoryName}` : `Enable ${repositoryName}`}
      >
        {enabled ? <CheckCircle2 className="size-3.5" /> : <CircleOff className="size-3.5" />}
        {enabled ? "On" : "Off"}
      </Button>
    </form>
  );
}
