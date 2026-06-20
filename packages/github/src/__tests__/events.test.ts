import { describe, expect, it } from "vitest";
import { SUBSCRIBED_EVENTS, parseWebhookEvent } from "../webhook/events.js";

function deliver(name: string, body: object) {
  return parseWebhookEvent({ "x-github-event": name }, JSON.stringify(body));
}

describe("parseWebhookEvent", () => {
  it("narrows a pull_request event with action", () => {
    const evt = deliver("pull_request", {
      action: "synchronize",
      number: 5,
      pull_request: { number: 5, head: { sha: "abc", ref: "feat" }, base: { ref: "main" } },
    });
    expect(evt?.name).toBe("pull_request");
    expect(evt?.action).toBe("synchronize");
    if (evt?.name === "pull_request") {
      expect(evt.payload.pull_request.head.sha).toBe("abc");
    }
  });

  it("narrows a check_run requested_action", () => {
    const evt = deliver("check_run", {
      action: "requested_action",
      check_run: { id: 11, head_sha: "deadbeef" },
      requested_action: { identifier: "rerun" },
    });
    expect(evt?.name).toBe("check_run");
    if (evt?.name === "check_run") {
      expect(evt.payload.requested_action?.identifier).toBe("rerun");
    }
  });

  it("parses every subscribed event", () => {
    for (const name of SUBSCRIBED_EVENTS) {
      const evt = parseWebhookEvent({ "x-github-event": name }, JSON.stringify({ action: "x" }));
      expect(evt?.name).toBe(name);
    }
  });

  it("returns null for an unsubscribed event", () => {
    expect(deliver("push", { ref: "refs/heads/main" })).toBeNull();
  });

  it("returns null when the event header is missing", () => {
    expect(parseWebhookEvent({}, "{}")).toBeNull();
  });

  it("returns null (never throws) for an unparseable body", () => {
    expect(parseWebhookEvent({ "x-github-event": "pull_request" }, "{not json")).toBeNull();
  });

  it("reads a differently-cased header key", () => {
    const evt = parseWebhookEvent(
      { "X-GitHub-Event": "issue_comment" },
      JSON.stringify({ action: "created" }),
    );
    expect(evt?.name).toBe("issue_comment");
  });
});
