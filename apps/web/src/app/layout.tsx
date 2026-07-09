import type { Metadata } from "next";
import { Fustat, JetBrains_Mono, Newsreader } from "next/font/google";

import "./globals.css";

// Editorial-codex typography: Newsreader (serif display — chapter titles, PR
// headlines, hero), Fustat (humanist sans body/UI), JetBrains Mono (code, data,
// numerals). Self-hosted via next/font (no runtime CDN). Exposed as --font-*-app
// vars that globals.css composes into --font-serif / --font-sans / --font-mono.
const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif-app",
  display: "swap",
  style: ["normal", "italic"],
});
const fustat = Fustat({
  subsets: ["latin"],
  variable: "--font-sans-app",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Folio",
  description: "GitHub-native code review, one chapter at a time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dev tooling (IDE click-to-source locator / browser extensions) injects
  // attributes like data-locator-target onto <html>; suppress the resulting
  // server/client hydration-attribute mismatch warning.
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`dark ${newsreader.variable} ${fustat.variable} ${jetbrainsMono.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
