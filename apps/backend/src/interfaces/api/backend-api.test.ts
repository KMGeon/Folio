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
    const pulls = await request(app.getHttpServer()).get("/api/v1/pulls");
    expect(pulls.status).toBe(401);
    expect(pulls.body.error.code).toBe("unauthorized");
    await app.close();
  });
});
