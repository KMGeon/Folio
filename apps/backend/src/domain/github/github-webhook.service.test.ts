import { describe, expect, it, vi } from "vitest";

const isFolioEnabledByFullName = vi.fn(async () => false);

vi.mock("@folio/db", () => ({
  repositoriesRepo: { isFolioEnabledByFullName },
}));

vi.mock("../../config.js", () => ({
  config: { GITHUB_APP_WEBHOOK_SECRET: "secret" },
}));

const { GitHubWebhookService } = await import("./github-webhook.service.js");

function makeService(
  event: unknown = {
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
  },
) {
  const adapter = {
    verifySignature: vi.fn(() => true),
    parseEvent: vi.fn(() => event),
  };
  const reviewJobQueue = {
    enqueueReviewPull: vi.fn(async () => ({ id: "job-1" })),
  };
  const installationSync = {
    sync: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
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

  return { service, reviewJobQueue, installationSync, logger };
}

async function accept(service: InstanceType<typeof GitHubWebhookService>) {
  await service.accept({
    headers: {
      deliveryId: "delivery-1",
      eventName: "pull_request",
      signature: "sha256=valid",
    },
    rawBody: "{}",
  });
}

describe("GitHubWebhookService", () => {
  it("skips review jobs for disabled repositories", async () => {
    isFolioEnabledByFullName.mockResolvedValue(false);
    const { service, reviewJobQueue, logger } = makeService();

    await accept(service);

    expect(reviewJobQueue.enqueueReviewPull).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "[folio] skipped disabled repository webhook",
      expect.objectContaining({ repository: "KMGeon/Folio" }),
    );
  });

  it.each(["added", "removed"])(
    "reconciles installation repositories when GitHub reports %s",
    async (action) => {
      const { service, installationSync } = makeService({
        name: "installation_repositories",
        action,
        payload: { installation: { id: 123 } },
      });

      await accept(service);

      expect(installationSync.sync).toHaveBeenCalledWith({ githubInstallationId: 123 });
    },
  );

  it.each(["suspend", "deleted"])("disconnects repositories on installation %s", async (action) => {
    const { service, installationSync } = makeService({
      name: "installation",
      action,
      payload: {
        installation: { id: 123, account: { id: 42, login: "acme", type: "Organization" } },
      },
    });

    await accept(service);

    expect(installationSync.disconnect).toHaveBeenCalledWith(123);
  });
});
