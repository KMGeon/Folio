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

  it("keeps the PR review API stubs available", async () => {
    const app = await createTestServer();

    const pulls = await request(app.getHttpServer()).get("/api/v1/pulls");
    const chapters = await request(app.getHttpServer()).get("/api/v1/pulls/pr-1/chapters");

    expect(pulls.status).toBe(200);
    expect(pulls.body).toEqual({ success: true, data: [] });
    expect(chapters.status).toBe(200);
    expect(chapters.body).toEqual({ success: true, data: { chapters: [], prologue: null } });
    await app.close();
  });
});
