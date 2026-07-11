import { SetMetadata } from "@nestjs/common";

export const REQUIRE_LIVE_REPOSITORY_PERMISSION = "require_live_repository_permission";

export const RequireLiveRepositoryPermission = () =>
  SetMetadata(REQUIRE_LIVE_REPOSITORY_PERMISSION, true);
