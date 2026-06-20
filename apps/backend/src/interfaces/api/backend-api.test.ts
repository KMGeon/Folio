import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module.js";

async function createTestServer() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  // Mirror the real index.ts bootstrap: guards read req.cookies, which requires cookie-parser.
  app.use(cookieParser());
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

  it("requires a session for the PR review API", async () => {
    const app = await createTestServer();
    // The review route is session-guarded, so an unauthenticated request is rejected
    // with 401 before reaching the handler (the "no review found" 404 path is covered
    // by the controller unit test, which exercises an authenticated request).
    const res = await request(app.getHttpServer()).get("/api/v1/pulls/acme/widget/1/review");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
    await app.close();
  });
});
