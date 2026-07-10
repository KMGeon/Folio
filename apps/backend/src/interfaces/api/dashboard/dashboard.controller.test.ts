import { type ExecutionContext } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { DashboardFacade } from "../../../application/dashboard/dashboard.facade.js";
import { LOGGER_PORT } from "../../../internal/logger/logger.port.js";
import { CoreExceptionFilter } from "../../../support/error/core-exception.filter.js";
import { ApiResponseInterceptor } from "../common/api-response.interceptor.js";
import { SessionAuthGuard } from "../common/session-auth.guard.js";
import { DashboardController } from "./dashboard.controller.js";

const dashboardUser = { id: "u1", login: "KMGeon", avatarUrl: "https://a/u1" };
const dashboardAllowGuard = {
  canActivate: (context: ExecutionContext) => {
    context.switchToHttp().getRequest().user = dashboardUser;
    return true;
  },
};

describe("DashboardController", () => {
  it("returns all open pull pages from the static route", async () => {
    const data = {
      ready: { items: [], nextCursor: null, count: 0 },
      yours: { items: [], nextCursor: null, count: 0 },
      other: { items: [], nextCursor: null, count: 0 },
    };
    const getOpenPullPagesForUser = vi.fn(async () => data);
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardFacade,
          useValue: { getOpenPullPagesForUser, getPullPageForUser: vi.fn() },
        },
        { provide: LOGGER_PORT, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
        { provide: APP_FILTER, useClass: CoreExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(dashboardAllowGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer()).get(
      "/api/v1/dashboard/pulls/open?limit=20&ordering=updated&direction=desc&showDrafts=true",
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data });
    expect(getOpenPullPagesForUser).toHaveBeenCalledWith(
      { id: "u1", login: "KMGeon" },
      { limit: 20, q: undefined, ordering: "updated", direction: "desc", showDrafts: true },
    );
    await app.close();
  });

  it("wraps invalid dashboard pull query errors in the common API envelope", async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardFacade, useValue: { getPullPageForUser: vi.fn() } },
        { provide: LOGGER_PORT, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
        { provide: APP_FILTER, useClass: CoreExceptionFilter },
        { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
      ],
    })
      .overrideGuard(SessionAuthGuard)
      .useValue(dashboardAllowGuard)
      .compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer()).get("/api/v1/dashboard/pulls?bucket=bogus");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: "bad_request", message: "The request is invalid." },
      path: "/api/v1/dashboard/pulls?bucket=bogus",
    });
    expect(res.body.timestamp).toEqual(expect.any(String));
    await app.close();
  });
});
