import { describe, expect, it, vi } from "vitest";

const isFolioEnabledByFullName = vi.fn(async () => false);

vi.mock("@folio/db", () => ({
  repositoriesRepo: { isFolioEnabledByFullName },
}));

vi.mock("../../config.js", () => ({
  config: { GITHUB_APP_WEBHOOK_SECRET: "secret" },
}));

const { GitHubWebhookService } = await import("./github-webhook.service.js");

function makeService() {
  const adapter = {
    verifySignature: vi.fn(() => true),
    parseEvent: vi.fn(() => ({
      name: "pull_request",
      action: "opened",
      payload: {
        installation: { id: 123 },
        repository: {
          full_name: "KMGeon/Folio",
          owner: { login: "KMGeon" },
          name: "Folio",
        },
        pull_request: {
          number: 12,
          head: { sha: "abc123" },
        },
      },
    })),
  };
  const reviewJobQueue = {
    enqueueReviewPull: vi.fn(async () => ({ id: "job-1" })),
  };
  const installationSync = {
    sync: vi.fn(async () => undefined),
  };
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const service = new GitHubWebhookService(
    adapter as never,
    reviewJobQueue as never,
    installationSync as never,
    logger as never,
  );

  return { service, reviewJobQueue, logger };
}

describe("GitHubWebhookService", () => {
  it("skips review jobs for disabled repositories", async () => {
    isFolioEnabledByFullName.mockResolvedValue(false);
    const { service, reviewJobQueue, logger } = makeService();

    await service.accept({
      headers: {
        deliveryId: "delivery-1",
        eventName: "pull_request",
        signature: "sha256=valid",
      },
      rawBody: "{}",
    });

    expect(reviewJobQueue.enqueueReviewPull).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "[folio] skipped disabled repository webhook",
      expect.objectContaining({ repository: "KMGeon/Folio" }),
    );
  });
});
