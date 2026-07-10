import { describe, expect, it } from "vitest";
import { auditLogs } from "./audit-logs.js";

describe("auditLogs schema", () => {
  it("accepts the explicit system-admin transfer action", () => {
    expect(auditLogs.action.enumValues).toContain("system_admin_transfer");
  });
});
