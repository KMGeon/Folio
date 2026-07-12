import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface MigrationJournal {
  entries: {
    idx: number;
    when: number;
    tag: string;
  }[];
}

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

function readJournal(): MigrationJournal {
  return JSON.parse(
    readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as MigrationJournal;
}

describe("migration journal", () => {
  it("keeps the newest migration timestamp above every prior migration", () => {
    const { entries } = readJournal();
    const latest = entries.at(-1);
    const priorTimestamps = entries.slice(0, -1).map((entry) => entry.when);

    expect(latest).toBeDefined();
    // Drizzle uses `when`, not `idx`, to find pending migrations; a stale tail is skipped silently.
    expect(latest?.when).toBeGreaterThan(Math.max(...priorTimestamps));
  });

  it("keeps journal indexes contiguous and every SQL file present", () => {
    const { entries } = readJournal();

    expect(entries.map((entry) => entry.idx)).toEqual(entries.map((_, index) => index));
    for (const entry of entries) {
      expect(existsSync(path.join(migrationsFolder, `${entry.tag}.sql`))).toBe(true);
    }
  });
});
