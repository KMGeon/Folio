import type { WorkspaceRole } from "@folio/types";
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_WORKSPACE_ROLE = "require_workspace_role";

export const RequireWorkspaceRole = (role: WorkspaceRole) =>
  SetMetadata(REQUIRE_WORKSPACE_ROLE, role);
