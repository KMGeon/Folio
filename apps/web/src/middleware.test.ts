import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("middleware public routes", () => {
  it("keeps the public marketing home (site root) outside the session gate", async () => {
    const source = await readFile(new URL("./middleware.ts", import.meta.url), "utf8");

    expect(source).toContain('pathname === "/"');
  });

  it("keeps brand assets outside the session gate", async () => {
    const source = await readFile(new URL("./middleware.ts", import.meta.url), "utf8");

    expect(source).toContain('"/folio-mark.png"');
    expect(source).toContain('"/icon.png"');
  });
});

describe("middleware protected routes", () => {
  it("redirects an anonymous request with its exact path and query", () => {
    const request = new NextRequest("http://localhost:5173/admin/audit?action=user_approve");

    const response = middleware(request);

    expect(response.headers.get("location")).toBe(
      "http://localhost:5173/login?redirect=%2Fadmin%2Faudit%3Faction%3Duser_approve",
    );
  });

  it("overwrites trusted request-path context for an authenticated request", () => {
    const request = new NextRequest("http://localhost:5173/admin/audit?action=user_approve", {
      headers: {
        cookie: "folio_session=session-token",
        "x-folio-request-path": "/attacker-controlled",
      },
    });

    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-folio-request-path")).toBe(
      "/admin/audit?action=user_approve",
    );
  });
});
