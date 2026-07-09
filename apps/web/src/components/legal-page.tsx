import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";

export interface LegalSection {
  heading: string;
  /** Paragraphs and/or bullet lists rendered in order. */
  blocks: ({ type: "p"; text: string } | { type: "ul"; items: string[] })[];
}

export interface LegalPageProps {
  title: string;
  /** ISO date shown as the effective date, e.g. "2026-06-21". */
  effectiveDate: string;
  intro: string;
  sections: LegalSection[];
}

/** Shared standalone (pre-auth) layout for the Terms and Privacy documents. */
export function LegalPage({ title, effectiveDate, intro, sections }: LegalPageProps) {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-2xl px-6 py-12 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <BrandMark className="size-7" imageClassName="size-5" />
          <span className="font-serif text-lg italic leading-none">Folio</span>
        </Link>

        <header className="mt-10 border-b pb-6">
          <h1 className="font-serif text-4xl font-normal leading-tight tracking-tight">{title}</h1>
          <p className="mt-2 font-mono text-muted-foreground text-xs">
            최종 업데이트 · {effectiveDate}
          </p>
          <p className="mt-4 text-muted-foreground text-sm leading-relaxed">{intro}</p>
        </header>

        <div className="mt-8 space-y-8">
          {sections.map((section, i) => (
            <section key={section.heading}>
              <h2 className="font-serif text-xl font-normal tracking-tight">
                <span className="mr-2.5 font-mono text-muted-foreground/60 text-xs tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.heading}
              </h2>
              <div className="mt-3 space-y-3">
                {section.blocks.map((block, j) =>
                  block.type === "p" ? (
                    <p key={j} className="text-muted-foreground text-sm leading-relaxed">
                      {block.text}
                    </p>
                  ) : (
                    <ul key={j} className="space-y-1.5">
                      {block.items.map((item) => (
                        <li
                          key={item}
                          className="flex gap-2 text-muted-foreground text-sm leading-relaxed"
                        >
                          <span
                            aria-hidden
                            className="mt-2 size-1 shrink-0 rounded-full bg-primary"
                          />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t pt-6">
          <Link
            href="/login"
            className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          >
            ← 로그인으로 돌아가기
          </Link>
        </footer>
      </div>
    </main>
  );
}
