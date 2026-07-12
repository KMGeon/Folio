import { describe, expect, it, vi } from "vitest";
import { BoardEventHub } from "./board-event-hub.js";

describe("BoardEventHub", () => {
  it("fans out upserts only to subscribers that can see the repo", () => {
    const hub = new BoardEventHub();
    const seenA: string[] = [];
    const seenB: string[] = [];

    hub.subscribe({
      userId: "u1",
      repoIds: new Set(["r1"]),
      send: (event) => {
        if (event.type === "pr.upserted") {
          seenA.push(event.id);
        }
      },
      close: vi.fn(),
    });
    hub.subscribe({
      userId: "u2",
      repoIds: new Set(["r2"]),
      send: (event) => {
        if (event.type === "pr.upserted") {
          seenB.push(event.id);
        }
      },
      close: vi.fn(),
    });

    hub.publish({
      type: "pr.upserted",
      id: "acme-widget-1",
      repoId: "r1",
      number: 1,
      githubUpdatedAt: new Date().toISOString(),
    });

    expect(seenA).toEqual(["acme-widget-1"]);
    expect(seenB).toEqual([]);
  });

  it("broadcasts board.invalidate to matching repo scopes", () => {
    const hub = new BoardEventHub();
    const hits: string[] = [];
    hub.subscribe({
      userId: "u1",
      repoIds: new Set(["r1", "r2"]),
      send: (event) => {
        if (event.type === "board.invalidate") {
          hits.push(event.reason);
        }
      },
      close: vi.fn(),
    });

    hub.publish({ type: "board.invalidate", reason: "backfill_complete", repoId: "r1" });
    hub.publish({ type: "board.invalidate", reason: "reconcile", repoId: "r9" });

    expect(hits).toEqual(["backfill_complete"]);
  });
});
