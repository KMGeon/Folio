import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "app-search.tsx"), "utf8");

describe("AppSearch", () => {
  it("opens search as a dismissible modal", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("setOpen(false)");
  });

  it("opens from the shared rail search event", () => {
    expect(source).toContain('window.addEventListener("folio:focus-search"');
    expect(source).toContain("setOpen(true)");
    expect(source).toContain("inputRef.current?.focus()");
  });

  it("contains focus within the modal and returns it to the trigger on close", () => {
    expect(source).toContain("const triggerRef = useRef<HTMLButtonElement>(null)");
    expect(source).toContain("triggerRef.current?.focus()");
    expect(source).toContain('event.key !== "Tab"');
  });

  it("gives the modal query input an accessible name", () => {
    expect(source).toContain('aria-label="PR, repo 검색"');
  });
});
