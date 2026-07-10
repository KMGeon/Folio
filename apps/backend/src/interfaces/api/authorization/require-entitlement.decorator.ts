import type { EntitlementFeature } from "@folio/types";
import { SetMetadata } from "@nestjs/common";

export const REQUIRE_ENTITLEMENT = "require_entitlement";

export const RequireEntitlement = (feature: EntitlementFeature) =>
  SetMetadata(REQUIRE_ENTITLEMENT, feature);
