import { describe, expect, it } from "vitest";
import { createPatOctokit } from "./pat-octokit.js";

describe("createPatOctokit", () => {
  it("returns an Octokit instance bound to the token", () => {
    const client = createPatOctokit("ghp_test");
    expect(client).toBeDefined();
    expect(client.rest.pulls.get).toBeTypeOf("function");
  });

  it("throws on an empty token", () => {
    expect(() => createPatOctokit("")).toThrow(/token/i);
  });
});
