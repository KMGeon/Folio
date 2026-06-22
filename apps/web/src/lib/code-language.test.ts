import { describe, expect, it } from "vitest";

import { langFromPath } from "./code-language";

describe("langFromPath", () => {
  it("maps common code extensions to Shiki language ids", () => {
    expect(langFromPath("apps/backend/src/app.module.ts")).toBe("typescript");
    expect(langFromPath("src/components/App.tsx")).toBe("tsx");
    expect(langFromPath("Main.java")).toBe("java");
    expect(langFromPath("engine/core.cpp")).toBe("cpp");
    expect(langFromPath("include/core.h")).toBe("c");
    expect(langFromPath("bin/apmx_test.sh")).toBe("bash");
  });

  it("matches extensionless filenames like Dockerfile and Makefile", () => {
    expect(langFromPath("docker/Dockerfile")).toBe("docker");
    expect(langFromPath("Makefile")).toBe("make");
  });

  it("returns null for prose/unknown files so callers fall back to markdown", () => {
    expect(langFromPath("README.md")).toBeNull();
    expect(langFromPath("docs/notes")).toBeNull();
    expect(langFromPath("LICENSE")).toBeNull();
  });
});
