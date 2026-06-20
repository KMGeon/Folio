import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module.js";

async function createTestServer() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  await app.init();
  return app;
}

describe("Backend API", () => {
  it("reports service health", async () => {
    const app = await createTestServer();

    const res = await request(app.getHttpServer()).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        service: "folio-backend",
      },
    });
    expect(res.body.data.ts).toEqual(expect.any(String));
    await app.close();
  });

  it("returns 404 for a review that does not exist", async () => {
    // Stubs removed in Task 8; real GET endpoint returns 404 when no DB record found.
    const app = await createTestServer();

    const res = await request(app.getHttpServer()).get("/api/v1/pulls/acme/widget/1/review");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false });
    await app.close();
  });
});
