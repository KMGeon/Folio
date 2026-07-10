"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type MouseEvent, useEffect, useRef, useState } from "react";

import { fetchDashboard } from "@/lib/dashboard-api";

interface SearchItem {
  label: string;
  href: string;
  group: string;
}

// Static app routes are always reachable; PR paths are loaded lazily.
const ROUTES: SearchItem[] = [
  { label: "대시보드", href: "/", group: "페이지" },
  { label: "설치", href: "/onboarding/install", group: "페이지" },
  { label: "설정", href: "/settings", group: "페이지" },
];

/** Header search that lists every navigable path (routes + open PRs) and jumps to it. */
export function AppSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>(ROUTES);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all PR paths once, lazily on first open (browser fetch carries the cookie).
  useEffect(() => {
    if (!open || loaded) {
      return;
    }
    setLoaded(true);
    fetchDashboard()
      .then((data) => {
        const pulls = data.pulls.map((p) => ({
          label: `${p.org}/${p.repo}#${p.number} · ${p.title}`,
          href: `/${p.org}/${p.repo}/pull/${p.number}/chapters/1`,
          group: "PR",
        }));
        setItems([...ROUTES, ...pulls]);
      })
      .catch(() => {});
  }, [open, loaded]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const focusSearch = () => setOpen(true);
    window.addEventListener("folio:focus-search", focusSearch);
    return () => window.removeEventListener("folio:focus-search", focusSearch);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items;

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const closeIfBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="검색"
        onClick={() => setOpen(true)}
        className="flex h-7 w-44 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:border-ring sm:w-56"
      >
        <Search className="size-3.5" />
        <span>PR, repo 검색</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-[10vh]"
          onMouseDown={closeIfBackdrop}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="검색"
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-lg border bg-popover shadow-lg"
          >
            <div className="relative border-b">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="PR, repo 검색"
                className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <div className="px-2 py-6 text-center font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                  결과 없음
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={`${item.group}-${item.href}`}
                    type="button"
                    // mousedown keeps route selection ahead of a browser focus change.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      go(item.href);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
                      {item.group}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground/90">{item.label}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
