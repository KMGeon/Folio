"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type DashboardOpenPullPages,
  type DashboardPull,
  fetchDashboardOpenPullPages,
} from "@/lib/dashboard-api";

interface SearchItem {
  label: string;
  href: string;
  group: string;
}

const RESULT_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 200;

function recentSearchItems(pages: DashboardOpenPullPages): SearchItem[] {
  const unique = new Map<string, DashboardPull>();
  for (const page of [pages.ready, pages.yours, pages.other]) {
    for (const item of page.items) {
      if ("status" in item) {
        unique.set(item.id, item);
      }
    }
  }
  return [...unique.values()]
    .sort((left, right) => Date.parse(right.updatedAtIso) - Date.parse(left.updatedAtIso))
    .slice(0, RESULT_LIMIT)
    .map((item) => ({
      label: `${item.org}/${item.repo}#${item.number} · ${item.title}`,
      href: `/${item.org}/${item.repo}/pull/${item.number}/chapters/1`,
      group: "PR",
    }));
}

/** Header search that lists recent open PRs and jumps to the first review chapter. */
export function AppSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [retryVersion, setRetryVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const requestId = ++requestIdRef.current;
    const normalizedQuery = query.trim();
    setLoading(true);
    setError(false);
    const runSearch = () => {
      void fetchDashboardOpenPullPages({
        limit: RESULT_LIMIT,
        ...(normalizedQuery ? { q: normalizedQuery } : {}),
        ordering: "updated",
        direction: "desc",
        showDrafts: true,
      })
        .then((pages) => {
          if (requestId === requestIdRef.current) {
            setItems(recentSearchItems(pages));
          }
        })
        .catch(() => {
          if (requestId === requestIdRef.current) {
            setError(true);
          }
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setLoading(false);
          }
        });
    };
    const timeout = normalizedQuery ? window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS) : undefined;
    if (!normalizedQuery) {
      runSearch();
    }
    return () => {
      requestIdRef.current += 1;
      if (timeout !== undefined) {
        window.clearTimeout(timeout);
      }
    };
  }, [open, query, retryVersion]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else if (wasOpenRef.current) {
      // A modal must return keyboard users to the control that opened it.
      returnFocusRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    const focusSearch = (event: Event) => {
      const source = (event as CustomEvent<{ trigger?: HTMLElement }>).detail?.trigger;
      returnFocusRef.current = source ?? triggerRef.current;
      setOpen(true);
    };
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

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("input, button:not(:disabled)") ?? [],
    );
    if (!focusable?.length) {
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="검색"
        ref={triggerRef}
        onClick={() => {
          returnFocusRef.current = triggerRef.current;
          setOpen(true);
        }}
        className="flex h-7 w-44 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:border-ring sm:w-56"
      >
        <Search className="size-3.5" />
        <span>PR 검색</span>
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 px-4 pt-[10vh]"
          onMouseDown={closeIfBackdrop}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="검색"
            onKeyDown={trapFocus}
            onMouseDown={(event) => event.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-lg border bg-popover shadow-lg"
          >
            <div className="relative border-b">
              <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
              <input
                ref={inputRef}
                aria-label="PR 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="PR 검색"
                className="h-11 w-full bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-80 overflow-y-auto p-1">
              {loading ? (
                <SearchMessage>불러오는 중</SearchMessage>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 px-2 py-6">
                  <SearchMessage>검색 결과를 불러오지 못했습니다</SearchMessage>
                  <button
                    type="button"
                    onClick={() => setRetryVersion((value) => value + 1)}
                    className="h-7 rounded-md border px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:border-ring focus-visible:outline-none"
                  >
                    다시 시도
                  </button>
                </div>
              ) : items.length === 0 ? (
                <SearchMessage>
                  {query.trim() ? "검색 결과가 없습니다" : "열린 PR이 없습니다"}
                </SearchMessage>
              ) : (
                items.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => go(item.href)}
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

function SearchMessage({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 py-6 text-center font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </div>
  );
}
