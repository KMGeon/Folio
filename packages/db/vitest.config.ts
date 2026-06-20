import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit-style tests live in src/**, db-gated e2e tests in test/**.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // DB e2e tests share a single Postgres instance; run them serially so
    // concurrency assertions (SKIP-LOCKED) are deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
