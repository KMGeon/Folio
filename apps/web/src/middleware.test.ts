import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("middleware public routes", () => {
  it("keeps the public homepage outside the session gate", async () => {
    const source = await readFile(new URL("./middleware.ts", import.meta.url), "utf8");

    expect(source).toContain('"/homepage"');
  });
});
