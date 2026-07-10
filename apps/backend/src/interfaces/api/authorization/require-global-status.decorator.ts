import type { GlobalStatus } from "@folio/types";
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_GLOBAL_STATUS = "require_global_status";

export const RequireGlobalStatus = (status: GlobalStatus) =>
  SetMetadata(REQUIRE_GLOBAL_STATUS, status);
