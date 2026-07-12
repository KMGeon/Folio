import { createHmac } from "node:crypto";
import { Test } from "@nestjs/testing";
import type { repositoriesRepo as DbRepositoriesRepo } from "@folio/db";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-webhook-secret";
type FolioDbModule = { repositoriesRepo: typeof DbRepositoriesRepo } & Record<string, unknown>;

function sign(rawBody: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

// Stub the DB-backed side effects so the controller test stays hermetic.
const enqueueReviewPull = vi.fn(async () => ({ id: "job-1" }));
const isFolioEnabledByFullName = vi.hoisted(() => vi.fn(async () => true));
const syncInstallation = vi.fn(async () => undefined);

vi.mock("@folio/db", async (importOriginal) => {
  const actual = (await importOriginal()) as FolioDbModule;
  return {
    ...actual,
    repositoriesRepo: {
      ...actual.repositoriesRepo,
      isFolioEnabledByFullName,
    },
  };
});

async function createTestServer() {
  vi.resetModules();
  enqueueReviewPull.mockClear();
  isFolioEnabledByFullName.mockResolvedValue(true);
  isFolioEnabledByFullName.mockClear();
  syncInstallation.mockClear();
  process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
  // Import tokens from the freshly reset module graph so overrideProvider matches
  // the same class identity the AppModule wires up.
  const { AppModule } = await import("../../../app.module.js");
  const { ReviewJobQueue } =
    await import("../../../infrastructure/persistence/review-job-queue.js");
  const { InstallationSyncFacade } =
    await import("../../../application/github/installation-sync.facade.js");
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ReviewJobQueue)
    .useValue({ enqueueReviewPull })
    .overrideProvider(InstallationSyncFacade)
    .useValue({ sync: syncInstallation })
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

describe("POST /webhooks/github", () => {
  afterEach(() => {
    delete process.env.GITHUB_APP_WEBHOOK_SECRET;
  });

  it("accepts a signed GitHub webhook delivery", async () => {
    const app = await createTestServer();
    const body = JSON.stringify({
      action: "opened",
      number: 12,
      installation: { id: 123456 },
      repository: { full_name: "KMGeon/Folio", owner: { login: "KMGeon" }, name: "Folio" },
      pull_request: {
        number: 12,
        head: { sha: "abc123", ref: "feature" },
        base: { ref: "main" },
      },
    });

    const res = await request(app.getHttpServer())
      .post("/webhooks/github")
      .set("content-type", "application/json")
      .set("x-github-delivery", "delivery-1")
      .set("x-github-event", "pull_request")
      .set("x-hub-signature-256", sign(body))
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        received: true,
        deliveryId: "delivery-1",
        event: "pull_request",
        action: "opened",
        installationId: 123456,
        repository: "KMGeon/Folio",
        pullNumber: 12,
      },
    });
    // The opened PR is enqueued for decomposition keyed by its head SHA.
    expect(enqueueReviewPull).toHaveBeenCalledWith({
      owner: "KMGeon",
      repo: "Folio",
      number: 12,
      headSha: "abc123",
    });
    await app.close();
  });

  it("syncs the installation and its repositories on an installation event", async () => {
    const app = await createTestServer();
    const body = JSON.stringify({
      action: "created",
      installation: { id: 123456, account: { id: 42, login: "KMGeon", type: "User" } },
    });

    const res = await request(app.getHttpServer())
      .post("/webhooks/github")
      .set("content-type", "application/json")
      .set("x-github-delivery", "delivery-install")
      .set("x-github-event", "installation")
      .set("x-hub-signature-256", sign(body))
      .send(body);

    expect(res.status).toBe(202);
    expect(syncInstallation).toHaveBeenCalledWith({
      githubInstallationId: 123456,
      account: { githubAccountId: 42, login: "KMGeon", type: "User" },
    });
    expect(enqueueReviewPull).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a delivery with an invalid signature", async () => {
    const app = await createTestServer();
    const body = JSON.stringify({ action: "ping" });

    const res = await request(app.getHttpServer())
      .post("/webhooks/github")
      .set("content-type", "application/json")
      .set("x-github-delivery", "delivery-2")
      .set("x-github-event", "ping")
      .set("x-hub-signature-256", sign(body, "wrong-secret"))
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: "invalid_signature",
        message: "GitHub webhook signature is invalid.",
      },
      path: "/webhooks/github",
    });
    expect(res.body.timestamp).toEqual(expect.any(String));
    await app.close();
  });

  it("rejects a delivery without required GitHub headers", async () => {
    const app = await createTestServer();
    const body = JSON.stringify({ action: "ping" });

    const res = await request(app.getHttpServer())
      .post("/webhooks/github")
      .set("content-type", "application/json")
      .set("x-hub-signature-256", sign(body))
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: {
        code: "missing_github_headers",
        message: "Required GitHub webhook headers are missing.",
      },
      path: "/webhooks/github",
    });
    expect(res.body.timestamp).toEqual(expect.any(String));
    await app.close();
  });
});
