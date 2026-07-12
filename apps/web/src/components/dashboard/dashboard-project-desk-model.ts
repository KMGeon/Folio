import type {
  DashboardBucket,
  DashboardCompletedPull,
  DashboardPull,
  DashboardPullPage,
  DashboardRepo,
} from "@/lib/dashboard-api";

export const dashboardCockpitStates = [
  "attention",
  "ready",
  "reviewing",
  "processing",
  "complete",
] as const;

export type DashboardCockpitState = (typeof dashboardCockpitStates)[number];
export type DashboardOpenCockpitState = Exclude<DashboardCockpitState, "complete">;
export type DashboardQueueFocus = DashboardCockpitState;
export type DashboardProjectPages = Record<DashboardBucket, DashboardPullPage>;
export type DashboardScopeCounts = Record<DashboardCockpitState, number>;

export interface DashboardProjectData {
  repo: DashboardRepo;
  pages: DashboardProjectPages;
  isLoading: boolean;
  error: string | null;
}

export function emptyDashboardProjectData(
  repo: DashboardRepo,
  isLoading = true,
): DashboardProjectData {
  return {
    repo,
    pages: {
      ready: emptyPage(),
      yours: emptyPage(),
      other: emptyPage(),
      completed: emptyPage(),
    },
    isLoading,
    error: null,
  };
}

export function dashboardProjectName(fullName: string): string {
  return fullName.split("/").at(-1) || fullName;
}

export function dashboardScopeName(repo: DashboardRepo | null): string {
  return repo ? dashboardProjectName(repo.fullName) : "All projects";
}

export function dashboardProjectCounts(project: DashboardProjectData): DashboardScopeCounts {
  return dashboardCockpitCounts(project);
}

export function dashboardCockpitCounts(project: DashboardProjectData): DashboardScopeCounts {
  const counts = emptyCockpitCounts();
  for (const pull of dashboardOpenPulls(project)) {
    counts[dashboardClassifyPull(pull)] += 1;
  }
  counts.complete = project.pages.completed.count;
  return counts;
}

export function dashboardClassifyPull(pull: DashboardPull): DashboardOpenCockpitState {
  if (pull.analysisStatus === "failed") {
    return "attention";
  }
  if (
    pull.status === "processing" ||
    pull.analysisStatus === "processing" ||
    pull.analysisStatus === "retrying"
  ) {
    return "processing";
  }
  if (pull.viewedChapters > 0) {
    return "reviewing";
  }
  if (pull.analysisStatus === "complete" || pull.status === "ready") {
    return "ready";
  }
  // Unknown analysis state remains actionable preparation work, not a ready review.
  return "processing";
}

export function dashboardProjectPullsForState(
  project: DashboardProjectData,
  state: DashboardCockpitState,
): (DashboardPull | DashboardCompletedPull)[] {
  if (state === "complete") {
    return project.pages.completed.items as DashboardCompletedPull[];
  }
  return dashboardOpenPulls(project).filter((pull) => dashboardClassifyPull(pull) === state);
}

export function dashboardDefaultFocus(counts: DashboardScopeCounts): DashboardQueueFocus {
  for (const state of dashboardCockpitStates) {
    if (counts[state] > 0) {
      return state;
    }
  }
  return "complete";
}

function emptyCockpitCounts(): DashboardScopeCounts {
  return {
    attention: 0,
    ready: 0,
    reviewing: 0,
    processing: 0,
    complete: 0,
  };
}

export function dashboardScopeCounts(
  projects: DashboardProjectData[],
  activeRepoId: string | null,
): DashboardScopeCounts {
  const selected = activeRepoId
    ? projects.filter((project) => project.repo.id === activeRepoId)
    : projects;
  return selected.reduce<DashboardScopeCounts>((counts, project) => {
    const next = dashboardProjectCounts(project);
    counts.attention += next.attention;
    counts.ready += next.ready;
    counts.reviewing += next.reviewing;
    counts.processing += next.processing;
    counts.complete += next.complete;
    return counts;
  }, emptyCockpitCounts());
}

export function dashboardNextPull(
  project: DashboardProjectData,
  focus: DashboardQueueFocus,
): DashboardPull | null {
  if (focus === "complete") {
    return null;
  }
  return dashboardOpenPulls(project).find((pull) => dashboardClassifyPull(pull) === focus) ?? null;
}

export function dashboardEmptyTitle(scopeName: string): string {
  return `${scopeName} 큐가 비어 있습니다`;
}

export function dashboardEmptyDescription(scopeName: string, focus: DashboardQueueFocus): string {
  if (focus === "complete") {
    return `${scopeName}에서 아직 완료된 Folio 리뷰가 없습니다.`;
  }
  if (focus === "attention") {
    return `${scopeName} 범위에 재시도하거나 변경사항을 확인할 PR이 없습니다.`;
  }
  return `${scopeName} 범위에 리뷰할 open PR이 없거나 Folio가 아직 분해하지 않았습니다.`;
}

function dashboardOpenPulls(project: DashboardProjectData): DashboardPull[] {
  return ([project.pages.ready, project.pages.yours, project.pages.other] as const)
    .flatMap((page) => page.items)
    .filter(isDashboardPull);
}

function isDashboardPull(pull: DashboardPull | DashboardCompletedPull): pull is DashboardPull {
  return "viewedChapters" in pull;
}

function emptyPage(): DashboardPullPage {
  return { items: [], nextCursor: null, count: 0 };
}
