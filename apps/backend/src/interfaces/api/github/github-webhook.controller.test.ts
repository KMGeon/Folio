import { createHmac } from "node:crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-webhook-secret";

function sign(rawBody: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
}

async function createTestServer() {
  vi.resetModules();
  process.env.GITHUB_APP_WEBHOOK_SECRET = SECRET;
  const { AppModule } = await import("../../../app.module.js");
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
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
