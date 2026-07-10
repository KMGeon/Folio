"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

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

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items;

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="PR, repo 검색"
          className="h-7 w-44 rounded-md border bg-muted/40 pr-2 pl-8 text-xs outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring sm:w-56"
        />
      </div>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 max-h-80 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-2 py-6 text-center font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
              결과 없음
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={`${item.group}-${item.href}`}
                type="button"
                // mousedown (not click) fires before the input blur closes the panel.
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
      ) : null}
    </div>
  );
}
