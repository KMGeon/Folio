"use client";

import dynamic from "next/dynamic";

// R3F must stay client-only; skip SSR so the server page can still render statically.
const ChapterScene = dynamic(() => import("./chapter-scene").then((m) => m.ChapterScene), {
  ssr: false,
  loading: () => null,
});

/** Full-bleed 3D chapter scene used as the login spine's background layer. */
export function ChapterSceneBackground() {
  return (
    <div aria-hidden className="absolute inset-0">
      <ChapterScene />
    </div>
  );
}
