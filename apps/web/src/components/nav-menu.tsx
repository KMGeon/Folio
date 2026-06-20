"use client";

import { PlugZap, Settings, SquareStack } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const NAV = [
  { href: "/", label: "대시보드", icon: SquareStack },
  { href: "/onboarding/install", label: "설치", icon: PlugZap },
  { href: "/settings", label: "설정", icon: Settings },
];

/** The favicon (F mark) acts as a trigger for the app nav, shown in a popover. */
export function NavMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="메뉴 열기"
        className="flex items-center rounded-md p-1 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[open=true]:bg-accent"
        data-open={open}
      >
        <img src="/folio-mark.png" alt="Folio" width={28} height={28} className="size-7" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
        >
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
