import type { GitHubRepoAccessLevel } from "@folio/github";
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_REPOSITORY_PERMISSION = "require_repository_permission";

export const RequireRepositoryPermission = (level: GitHubRepoAccessLevel) =>
  SetMetadata(REQUIRE_REPOSITORY_PERMISSION, level);
