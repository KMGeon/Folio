import { describe, expect, it } from "vitest";
import { CoreException } from "../../support/error/core-exception.js";
import { ErrorType } from "../../support/error/error-type.js";
import { decodeAdminPageCursor, encodeAdminPageCursor } from "./admin-page-cursor.js";

const id = "123e4567-e89b-42d3-a456-426614174000";
const createdAt = new Date("2026-07-11T03:04:05.000Z");

describe("admin page cursor", () => {
  it("round-trips the versioned createdAt and id payload", () => {
    const encoded = encodeAdminPageCursor({ createdAt, id });

    expect(decodeAdminPageCursor(encoded)).toEqual({ createdAt, id });
    expect(encoded).not.toContain("{");
  });

  it("returns undefined for an omitted cursor", () => {
    expect(decodeAdminPageCursor()).toBeUndefined();
  });

  it.each([
    "not-valid-base64!",
    Buffer.from("not json").toString("base64url"),
    Buffer.from(
      JSON.stringify({ v: 1, createdAt: createdAt.toISOString(), id: "not-uuid" }),
    ).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, createdAt: "yesterday", id })).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 2, createdAt: createdAt.toISOString(), id })).toString(
      "base64url",
    ),
    Buffer.from(
      JSON.stringify({ v: 1, createdAt: createdAt.toISOString(), id, extra: true }),
    ).toString("base64url"),
  ])("rejects an invalid opaque cursor", (value) => {
    const error = (() => {
      try {
        decodeAdminPageCursor(value);
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(CoreException);
    expect((error as CoreException).errorType).toBe(ErrorType.InvalidAdminCursor);
  });
});
