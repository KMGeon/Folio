/*
 * Mock data for Folio's IA-first frontend. The shapes intentionally mirror the
 * future backend contracts: dashboard PR rows, PR overview, file-level chapters,
 * and focused diff content.
 */

export type ReviewStatus = "ready" | "processing" | "stale" | "error";
export type RiskLevel = "low" | "medium" | "high";

export type DashboardPull = {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  updatedAt: string;
  headBranch: string;
  baseBranch: string;
  status: ReviewStatus;
  chapterCount: number;
  viewedChapters: number;
  changedFiles: number;
  risk: RiskLevel;
};

export type ChapterFile = {
  path: string;
  additions: number;
  deletions: number;
  viewed: boolean;
};

export type Chapter = {
  index: number;
  title: string;
  summary: string;
  risk: RiskLevel;
  viewed: boolean;
  files: ChapterFile[];
  reviewHints: string[];
  risks: { file: string; why: string; severity: RiskLevel }[];
};

export type PrMeta = {
  id: string;
  org: string;
  repo: string;
  number: number;
  title: string;
  state: "open" | "merged" | "closed";
  author: string;
  openedAgo: string;
  updatedAt: string;
  headBranch: string;
  baseBranch: string;
  headSha: string;
  approvals: { done: number; total: number };
  changedFiles: number;
  additions: number;
  deletions: number;
  overallSummary: string;
  focusAreas: string[];
  chapters: Chapter[];
};

export type DiffLine = {
  n: number;
  kind: "add" | "del" | "ctx";
  text: string;
};

export const DASHBOARD_PULLS: DashboardPull[] = [
  {
    id: "stablyai-orca-5902",
    org: "stablyai",
    repo: "orca",
    number: 5902,
    title: "Fix stale review display follow-ups",
    author: "AmethystLiang",
    updatedAt: "30분 전",
    headBranch: "fix/stale-review-display",
    baseBranch: "main",
    status: "ready",
    chapterCount: 4,
    viewedChapters: 1,
    changedFiles: 8,
    risk: "medium",
  },
  {
    id: "kmgeon-folio-42",
    org: "KMGeon",
    repo: "Folio",
    number: 42,
    title: "Add file-level chapter decomposition worker",
    author: "KMGeon",
    updatedAt: "12분 전",
    headBranch: "feature/codex-chapters",
    baseBranch: "main",
    status: "processing",
    chapterCount: 0,
    viewedChapters: 0,
    changedFiles: 14,
    risk: "high",
  },
  {
    id: "stablyai-orca-5888",
    org: "stablyai",
    repo: "orca",
    number: 5888,
    title: "Resolve Windows workspace deletion runtime mismatch",
    author: "DeanStratakos",
    updatedAt: "어제",
    headBranch: "bug/delete-workspace-windows",
    baseBranch: "main",
    status: "stale",
    chapterCount: 7,
    viewedChapters: 5,
    changedFiles: 19,
    risk: "low",
  },
];

export const PR: PrMeta = {
  id: "stablyai-orca-5902",
  org: "stablyai",
  repo: "orca",
  number: 5902,
  title: "Fix stale review display follow-ups",
  state: "open",
  author: "AmethystLiang",
  openedAgo: "30분 전에 열림",
  updatedAt: "Jun 20, 2026 10:05 UTC",
  headBranch: "fix/stale-review-display",
  baseBranch: "main",
  headSha: "ef578b0",
  approvals: { done: 2, total: 2 },
  changedFiles: 8,
  additions: 312,
  deletions: 74,
  overallSummary:
    "이 PR은 stale linked review 표시 흐름을 정리하고, parent row와 worktree card가 같은 필터링 기준을 사용하도록 맞춥니다. 관련 회귀 테스트와 locale catalog도 함께 보강합니다.",
  focusAreas: [
    "branch-discovered review와 linked-lookup review가 같은 행에서 중복되거나 누락되지 않는지 확인",
    "parent PR checks row의 stale filtering이 valid linked review를 숨기지 않는지 확인",
    "새 tooltip/AiVault locale key가 모든 catalog에 동일하게 추가되었는지 확인",
  ],
  chapters: [
    {
      index: 1,
      title: "Add linked review hint to cache types",
      summary:
        "linked review 상태를 cache layer에서 명시적으로 표현하도록 타입과 display metadata를 보강합니다.",
      risk: "low",
      viewed: true,
      files: [
        {
          path: "apps/web/src/components/review/pr-header.tsx",
          additions: 38,
          deletions: 8,
          viewed: true,
        },
        {
          path: "apps/web/src/lib/sample-review.ts",
          additions: 22,
          deletions: 4,
          viewed: true,
        },
      ],
      reviewHints: [
        "cache type 확장이 기존 persisted row를 깨지 않는지 확인",
        "linked review hint가 branch-discovered review와 구분되는지 확인",
      ],
      risks: [],
    },
    {
      index: 2,
      title: "Filter stale linked reviews in parent rows",
      summary:
        "parent PR check rows에서 stale linked review를 숨기되 branch-discovered row는 보존하도록 filtering 조건을 정리합니다.",
      risk: "medium",
      viewed: false,
      files: [
        {
          path: "apps/web/src/components/review/chapter-panel.tsx",
          additions: 84,
          deletions: 41,
          viewed: false,
        },
        {
          path: "apps/web/src/components/review/diff-viewer.tsx",
          additions: 46,
          deletions: 15,
          viewed: false,
        },
      ],
      reviewHints: [
        "linked lookup 결과가 stale일 때만 숨겨지는지 확인",
        "parent row와 worktree card row가 같은 visible state를 공유하는지 확인",
      ],
      risks: [
        {
          file: "apps/web/src/components/review/chapter-panel.tsx",
          why: "필터링 조건이 과하면 실제 review 상태가 UI에서 사라질 수 있습니다.",
          severity: "medium",
        },
      ],
    },
    {
      index: 3,
      title: "Add regression tests for review display filtering",
      summary:
        "branch-discovered review와 linked-lookup review 케이스를 분리해 stale filtering 회귀를 막는 테스트를 추가합니다.",
      risk: "low",
      viewed: false,
      files: [
        {
          path: "apps/web/src/components/review/chapter-panel.test.ts",
          additions: 96,
          deletions: 4,
          viewed: false,
        },
        {
          path: "apps/web/src/components/review/pr-header.test.ts",
          additions: 54,
          deletions: 2,
          viewed: false,
        },
      ],
      reviewHints: [
        "테스트 fixture가 실제 stale linked review payload를 충분히 반영하는지 확인",
        "기존 branch-discovered 경로가 새 테스트에서 함께 보호되는지 확인",
      ],
      risks: [],
    },
    {
      index: 4,
      title: "Repair locale catalog parity and keys",
      summary:
        "새 tooltip과 AiVault 관련 key가 main locale catalog와 동일하게 유지되도록 누락된 번역 key를 보강합니다.",
      risk: "low",
      viewed: false,
      files: [
        {
          path: "apps/web/src/messages/en.json",
          additions: 12,
          deletions: 0,
          viewed: false,
        },
        {
          path: "apps/web/src/messages/ko.json",
          additions: 12,
          deletions: 0,
          viewed: false,
        },
      ],
      reviewHints: [
        "모든 locale catalog에 같은 key set이 있는지 확인",
        "tooltip copy가 너무 길어 UI를 밀지 않는지 확인",
      ],
      risks: [],
    },
  ],
};

export function getActiveChapter() {
  const chapter = PR.chapters[1] ?? PR.chapters[0];
  if (!chapter) {
    throw new Error("Mock PR must include at least one chapter");
  }
  return chapter;
}

export const DIFF_LINES: DiffLine[] = [
  { n: 41, kind: "ctx", text: "function ParentPrChecksRows({ rows, linkedReviews }: Props) {" },
  {
    n: 42,
    kind: "ctx",
    text: "\tconst branchRows = rows.filter((row) => row.source === 'branch');",
  },
  { n: 43, kind: "del", text: "\tconst visibleLinkedReviews = linkedReviews;" },
  { n: 44, kind: "add", text: "\tconst visibleLinkedReviews = linkedReviews.filter((review) => {" },
  { n: 45, kind: "add", text: "\t\tif (!review.linkedWorktreeId) return true;" },
  { n: 46, kind: "add", text: "\t\treturn review.headSha === review.linkedHeadSha;" },
  { n: 47, kind: "add", text: "\t});" },
  { n: 48, kind: "ctx", text: "" },
  { n: 49, kind: "ctx", text: "\treturn (" },
  { n: 50, kind: "ctx", text: "\t\t<ReviewRows" },
  { n: 51, kind: "del", text: "\t\t\tlinkedReviews={linkedReviews}" },
  { n: 52, kind: "add", text: "\t\t\tlinkedReviews={visibleLinkedReviews}" },
  { n: 53, kind: "ctx", text: "\t\t\tbranchRows={branchRows}" },
  { n: 54, kind: "ctx", text: "\t\t/>" },
  { n: 55, kind: "ctx", text: "\t);" },
  { n: 56, kind: "ctx", text: "}" },
  { n: 57, kind: "ctx", text: "" },
  { n: 58, kind: "add", text: "export function isStaleLinkedReview(review: LinkedReview) {" },
  {
    n: 59,
    kind: "add",
    text: "\treturn Boolean(review.linkedWorktreeId && review.headSha !== review.linkedHeadSha);",
  },
  { n: 60, kind: "add", text: "}" },
];

export const REVIEW_COMMENT = {
  summary: [
    "keep parent PR checks rows aligned with WorktreeCard stale linked-review filtering",
    "add regression coverage for branch-discovered vs linked-lookup GitHub/GitLab review display",
    "repair locale catalog parity after the new tooltip/AiVault keys on main",
  ],
  verification: [
    "pnpm exec vitest run --config config/vitest.config.ts apps/web/src/components/review/pr-header.test.ts apps/web/src/components/review/chapter-panel.test.ts",
    "pnpm run typecheck",
    "pnpm run lint",
    "git diff --check",
  ],
};
