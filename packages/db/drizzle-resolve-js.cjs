/**
 * CJS preload for drizzle-kit (`node -r ./drizzle-resolve-js.cjs`).
 *
 * drizzle-kit loads the schema with `esbuild-register`, which transpiles each
 * `.ts` file but does NOT rewrite the explicit `.js` extensions that NodeNext
 * requires on relative imports. So a schema file's `require("./chapters.js")`
 * resolves to a non-existent `chapters.js` (only `chapters.ts` is on disk) and
 * fails with MODULE_NOT_FOUND.
 *
 * Patching this from inside drizzle.config.ts does not work: esbuild-register's
 * `registerTsconfigPaths()` snapshots `Module._resolveFilename` and its
 * `unregister()` (run right after the config loads) restores that snapshot,
 * discarding any patch applied while the config evaluated. Preloading here runs
 * BEFORE drizzle-kit registers anything, so our patched function becomes the
 * snapshot every later register/unregister cycle restores to.
 *
 * The patch keeps the source's NodeNext-correct `.js` specifiers (needed for
 * the package's own runtime/build) and only adds a `.js` -> `.ts` fallback for
 * relative requires that would otherwise fail.
 */
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function patchedResolveFilename(request, ...rest) {
  try {
    return originalResolveFilename.call(this, request, ...rest);
  } catch (err) {
    if (
      err &&
      err.code === "MODULE_NOT_FOUND" &&
      typeof request === "string" &&
      request.startsWith(".") &&
      request.endsWith(".js")
    ) {
      return originalResolveFilename.call(this, `${request.slice(0, -3)}.ts`, ...rest);
    }
    throw err;
  }
};
