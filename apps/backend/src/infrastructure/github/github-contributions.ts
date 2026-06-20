export interface ContributionDay {
  date: string;
  count: number;
}

/**
 * Fetch a user's PUBLIC GitHub contribution calendar by scraping the profile
 * contributions fragment. No token needed, so it preserves the "token discarded"
 * (Model B) design — but it only sees public contributions and depends on an
 * undocumented endpoint. Returns [] on any failure so the dashboard still renders.
 */
export async function fetchPublicContributions(login: string): Promise<ContributionDay[]> {
  try {
    const res = await fetch(`https://github.com/users/${encodeURIComponent(login)}/contributions`, {
      headers: { "user-agent": "Folio", "x-requested-with": "XMLHttpRequest" },
    });
    if (!res.ok) {
      return [];
    }
    const html = await res.text();

    // tool-tip "<id>" -> count, from text like "3 contributions on …" / "No contributions …".
    const counts = new Map<string, number>();
    for (const m of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
      const id = m[1] ?? "";
      const text = m[2] ?? "";
      const count = /^\s*No\b/i.test(text) ? 0 : Number.parseInt(text.replace(/,/g, ""), 10) || 0;
      counts.set(id, count);
    }

    const days: ContributionDay[] = [];
    for (const m of html.matchAll(/<td\b[^>]*class="[^"]*ContributionCalendar-day[^"]*"[^>]*>/g)) {
      const tag = m[0];
      const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1];
      if (!date) {
        continue;
      }
      const id = /\bid="([^"]+)"/.exec(tag)?.[1];
      const level = /data-level="(\d)"/.exec(tag)?.[1];
      // Prefer the exact tooltip count; fall back to the 0–4 level when absent.
      const count = id && counts.has(id) ? (counts.get(id) ?? 0) : level ? Number(level) : 0;
      days.push({ date, count });
    }
    return days;
  } catch {
    return [];
  }
}
