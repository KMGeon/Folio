import { AUDIT_ACTION } from "@folio/types";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  parseAdminAuditQuery,
  parseAdminAnalyticsQuery,
  parseAdminJobsQuery,
  parseAdminUsersQuery,
  parseAdminWorkspacesQuery,
} from "./admin-query.js";

describe("admin query parsing", () => {
  it("defaults and trims a user list query", () => {
    expect(parseAdminUsersQuery({ q: "  octo  " })).toEqual({
      limit: 25,
      q: "octo",
      status: "all",
    });
  });

  it("coerces bounded limits and preserves supported user filters", () => {
    expect(parseAdminUsersQuery({ limit: "100", status: "suspended", cursor: "opaque" })).toEqual({
      limit: 100,
      status: "suspended",
      cursor: "opaque",
    });
  });

  it("parses audit filters without changing ISO timestamps", () => {
    const query = {
      limit: "5",
      q: "  owner  ",
      action: AUDIT_ACTION.OWNER_TRANSFER,
      workspaceId: "123e4567-e89b-42d3-a456-426614174000",
      actorUserId: "223e4567-e89b-42d3-a456-426614174000",
      targetId: "323e4567-e89b-42d3-a456-426614174000",
      from: "2026-07-01T00:00:00+09:00",
      to: "2026-07-11T23:59:59Z",
      cursor: "opaque",
    };

    expect(parseAdminAuditQuery(query)).toEqual({ ...query, limit: 5, q: "owner" });
  });

  it("trims workspace search and accepts the installation-state filter", () => {
    expect(parseAdminWorkspacesQuery({ q: "  octo  ", installationState: "suspended" })).toEqual({
      limit: 25,
      q: "octo",
      installationState: "suspended",
    });
  });

  it("parses job filters and exact UUID search", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(
      parseAdminJobsQuery({
        q: id,
        status: "failed",
        kind: "review_pull",
        distressed: "true",
      }),
    ).toEqual({
      limit: 25,
      status: "failed",
      kind: "review_pull",
      distressed: true,
      jobId: id,
    });
    expect(parseAdminJobsQuery({ q: "not-a-uuid" })).toEqual({ limit: 25 });
  });

  it("defaults analytics to seven days and accepts thirty days", () => {
    expect(parseAdminAnalyticsQuery({})).toEqual({ range: "7d" });
    expect(parseAdminAnalyticsQuery({ range: "30d" })).toEqual({ range: "30d" });
  });

  it.each([
    [parseAdminUsersQuery, { limit: 0 }],
    [parseAdminUsersQuery, { limit: 101 }],
    [parseAdminUsersQuery, { limit: "1.5" }],
    [parseAdminUsersQuery, { q: "x".repeat(101) }],
    [parseAdminUsersQuery, { status: "unknown" }],
    [parseAdminAuditQuery, { from: "2026-07-01" }],
    [parseAdminAuditQuery, { to: "not-a-time" }],
    [parseAdminAuditQuery, { action: "unknown" }],
    [parseAdminAuditQuery, { workspaceId: "not-a-uuid" }],
    [parseAdminWorkspacesQuery, { installationState: "unknown" }],
    [parseAdminJobsQuery, { status: "unknown" }],
    [parseAdminJobsQuery, { kind: "unknown" }],
    [parseAdminAnalyticsQuery, { range: "90d" }],
  ] as const)("turns invalid input into BadRequestException", (parse, value) => {
    expect(() => parse(value)).toThrow(BadRequestException);
  });
});
