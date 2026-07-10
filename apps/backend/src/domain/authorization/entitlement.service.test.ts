import { ENTITLEMENT_FEATURE, GLOBAL_STATUS } from "@folio/types";
import { describe, expect, it } from "vitest";
import { AlwaysEntitledService } from "./entitlement.service.js";

describe("AlwaysEntitledService", () => {
  const svc = new AlwaysEntitledService();

  it("entitles an active user to every gated feature", async () => {
    const d = await svc.canUseFeature({
      userId: "u1",
      globalStatus: GLOBAL_STATUS.ACTIVE,
      feature: ENTITLEMENT_FEATURE.PR_ANALYSIS,
    });
    expect(d.entitled).toBe(true);
  });

  it("does not entitle a non-active user", async () => {
    const d = await svc.canUseFeature({
      userId: "u1",
      globalStatus: GLOBAL_STATUS.SUSPENDED,
      feature: ENTITLEMENT_FEATURE.PR_ANALYSIS,
    });
    expect(d.entitled).toBe(false);
  });
});
