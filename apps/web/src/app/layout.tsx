import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";

import "./globals.css";

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
      className={`dark ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
