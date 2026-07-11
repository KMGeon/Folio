import { vi } from "vitest";

export interface PullFixture {
  number: number;
  title: string;
  user: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  updated_at: string;
  draft?: boolean;
  closed_at?: string | null;
  merged_at?: string | null;
}

interface PullDetailFixture {
  additions: number;
  deletions: number;
  changed_files: number;
}

interface OctokitFixture {
  open: PullFixture[] | Record<string, PullFixture[]>;
  closed: PullFixture[] | Record<string, PullFixture[]>;
  details: Record<number, PullDetailFixture>;
  failDetailsFor?: Set<number>;
  failClosedList?: boolean;
  failOpenListForRepos?: Set<string>;
}

export function openPr({
  number,
  title = `PR ${number}`,
  head = "feat",
  user = "KMGeon",
  draft = false,
  updatedAt = "2026-06-20T00:00:00Z",
}: {
  number: number;
  title?: string;
  head?: string;
  user?: string;
  draft?: boolean;
  updatedAt?: string;
}): PullFixture {
  return {
    number,
    title,
    user: { login: user },
    head: { ref: head },
    base: { ref: "main" },
    updated_at: updatedAt,
    draft,
  };
}

export function closedPr({
  number,
  title = `Completed ${number}`,
  closedAt = "2026-07-08T09:00:00Z",
  mergedAt = null,
}: {
  number: number;
  title?: string;
  closedAt?: string;
  mergedAt?: string | null;
}): PullFixture {
  return {
    number,
    title,
    user: { login: "KMGeon" },
    head: { ref: "feat" },
    base: { ref: "main" },
    updated_at: closedAt,
    closed_at: closedAt,
    merged_at: mergedAt,
  };
}

export function repoRow(id: string, name: string) {
  return {
    id,
    owner: "KMGeon",
    name,
    fullName: `KMGeon/${name}`,
    defaultBranch: "main",
    folioEnabled: true,
  };
}

export function octokitWith({
  open,
  closed,
  details,
  failDetailsFor,
  failClosedList,
  failOpenListForRepos,
}: OctokitFixture) {
  const pulls = {
    list: vi.fn(async (options: PullListOptions) => {
      if (options.state === "closed") {
        if (failClosedList) {
          throw new Error("closed list failed");
        }
        const perPage = options.per_page ?? 20;
        const start = ((options.page ?? 1) - 1) * perPage;
        const data = pullsFor(closed, options.repo);
        const ordered = options.direction === "asc" ? [...data].reverse() : data;
        return { data: ordered.slice(start, start + perPage) };
      }
      return { data: pullsFor(open, options.repo) };
    }),
    get: vi.fn(async ({ pull_number }: { pull_number: number }) => {
      if (failDetailsFor?.has(pull_number)) {
        throw new Error("detail failed");
      }
      const detail = details[pull_number];
      return { data: detail ?? { additions: 0, deletions: 0, changed_files: 0 } };
    }),
  };
  return {
    paginate: vi.fn(
      async (_list: unknown, options: { repo?: string; state?: "open" | "closed" }) => {
        if (options.state === "open") {
          if (options.repo && failOpenListForRepos?.has(options.repo)) {
            throw new Error("open list failed");
          }
          return pullsFor(open, options.repo);
        }
        if (options.state === "closed") {
          throw new Error("closed pulls must use bounded list request");
        }
        return [];
      },
    ),
    rest: { pulls },
  };
}

type PullListOptions = {
  repo?: string;
  state?: "open" | "closed";
  page?: number;
  per_page?: number;
  direction?: "asc" | "desc";
};

function pullsFor(
  pulls: PullFixture[] | Record<string, PullFixture[]>,
  repo: string | undefined,
): PullFixture[] {
  return Array.isArray(pulls) ? pulls : (pulls[repo ?? ""] ?? []);
}
