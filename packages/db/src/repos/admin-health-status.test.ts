import { describe, expect, it } from "vitest";
import {
  codexPathStatus,
  workerFleetStatus,
  workerHeartbeatItemStatus,
} from "./admin-health-status.js";

describe("admin health status rules", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");

  it("marks worker ok within stale window and stale after", () => {
    expect(workerHeartbeatItemStatus(new Date("2026-07-12T11:59:30.000Z"), now, 45_000)).toBe("ok");
    expect(workerHeartbeatItemStatus(new Date("2026-07-12T11:59:00.000Z"), now, 45_000)).toBe(
      "stale",
    );
  });

  it("rolls up fleet status", () => {
    expect(workerFleetStatus([])).toBe("unknown");
    expect(workerFleetStatus(["stale", "stale"])).toBe("stale");
    expect(workerFleetStatus(["stale", "ok"])).toBe("ok");
  });

  it("classifies codex path from last review_pull success", () => {
    expect(codexPathStatus(null, now)).toBe("no_success");
    expect(codexPathStatus(new Date("2026-07-12T10:00:00.000Z"), now)).toBe("recent_success");
    expect(codexPathStatus(new Date("2026-07-10T12:00:00.000Z"), now)).toBe("aging");
  });
});
