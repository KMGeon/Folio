import { GLOBAL_STATUS, type EntitlementFeature, type GlobalStatus } from "@folio/types";
import { Injectable } from "@nestjs/common";

export type EntitlementDecision = { entitled: true } | { entitled: false; reason: string };

export interface EntitlementQuery {
  userId: string;
  globalStatus: GlobalStatus;
  feature: EntitlementFeature;
}

// Seam for a future USER-scoped subscription check (Decision 3/4). Swap the
// concrete implementation to enforce real entitlements; call sites stay put.
export abstract class EntitlementService {
  abstract canUseFeature(input: EntitlementQuery): Promise<EntitlementDecision>;
}

@Injectable()
export class AlwaysEntitledService extends EntitlementService {
  async canUseFeature(input: EntitlementQuery): Promise<EntitlementDecision> {
    if (input.globalStatus !== GLOBAL_STATUS.ACTIVE) {
      return { entitled: false, reason: "global status is not active" };
    }
    return { entitled: true };
  }
}
