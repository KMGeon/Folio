import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

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
