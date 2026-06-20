import type { Octokit } from "octokit";
import { describe, expect, it, vi } from "vitest";
import { type CheckRunInput, buildCheckRunBody, createCheckRun } from "../check-run.js";

const REF = { owner: "acme", repo: "widgets" };

const BASE_INPUT: CheckRunInput = {
  headSha: "deadbeef",
  name: "Folio Review",
  status: "completed",
  conclusion: "action_required",
  detailsUrl: "https://app.folio.dev/pr/5",
  output: { title: "Decomposition ready", summary: "3 chapters" },
  actions: [
    { label: "Open in Folio", description: "Review chapters", identifier: "open" },
    { label: "Re-run", description: "Re-decompose", identifier: "rerun" },
  ],
};

describe("buildCheckRunBody", () => {
  it("includes details_url and snake-cased fields", () => {
    const body = buildCheckRunBody(BASE_INPUT);
    expect(body.details_url).toBe("https://app.folio.dev/pr/5");
    expect(body.head_sha).toBe("deadbeef");
    expect(body.conclusion).toBe("action_required");
    expect(body.actions).toHaveLength(2);
  });

  it("rejects more than 3 actions", () => {
    expect(() =>
      buildCheckRunBody({
        ...BASE_INPUT,
        actions: [
          { label: "a", description: "d", identifier: "1" },
          { label: "b", description: "d", identifier: "2" },
          { label: "c", description: "d", identifier: "3" },
          { label: "d", description: "d", identifier: "4" },
        ],
      }),
    ).toThrow(/at most 3 actions/);
  });

  it("rejects labels longer than 20 chars", () => {
    expect(() =>
      buildCheckRunBody({
        ...BASE_INPUT,
        actions: [{ label: "x".repeat(21), description: "d", identifier: "1" }],
      }),
    ).toThrow(/exceeds 20 chars/);
  });

  it("omits undefined fields (partial updates)", () => {
    const body = buildCheckRunBody({ status: "in_progress" });
    expect(body).toEqual({ status: "in_progress" });
  });
});

describe("createCheckRun", () => {
  it("posts the assembled body and returns the id", async () => {
    const create = vi.fn().mockResolvedValue({ data: { id: 999 } });
    const client = { rest: { checks: { create } } } as unknown as Octokit;
    const result = await createCheckRun(client, REF, BASE_INPUT);
    expect(result).toEqual({ id: 999 });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "acme",
        repo: "widgets",
        details_url: "https://app.folio.dev/pr/5",
      }),
    );
  });
});
