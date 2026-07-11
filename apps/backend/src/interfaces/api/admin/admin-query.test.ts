import { AUDIT_ACTION } from "@folio/types";
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { parseAdminAuditQuery, parseAdminUsersQuery } from "./admin-query.js";

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
  ] as const)("turns invalid input into BadRequestException", (parse, value) => {
    expect(() => parse(value)).toThrow(BadRequestException);
  });
});
