import type {
  DashboardBucket,
  DashboardPull,
  DashboardPullPage,
  DashboardRepo,
} from "@/lib/dashboard-api";

export type DashboardQueueFocus = "ready" | "yours" | "completed";
export type DashboardProjectPages = Record<DashboardBucket, DashboardPullPage>;
export type DashboardScopeCounts = Record<"ready" | "yours" | "completed", number>;

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
  return {
    ready: project.pages.ready.count,
    yours: project.pages.yours.count,
    completed: project.pages.completed.count,
  };
}

export function dashboardScopeCounts(
  projects: DashboardProjectData[],
  activeRepoId: string | null,
): DashboardScopeCounts {
  const selected = activeRepoId
    ? projects.filter((project) => project.repo.id === activeRepoId)
    : projects;
  return selected.reduce<DashboardScopeCounts>(
    (counts, project) => {
      const next = dashboardProjectCounts(project);
      counts.ready += next.ready;
      counts.yours += next.yours;
      counts.completed += next.completed;
      return counts;
    },
    { ready: 0, yours: 0, completed: 0 },
  );
}

export function dashboardNextPull(
  project: DashboardProjectData,
  focus: DashboardQueueFocus,
): DashboardPull | null {
  if (focus === "completed") {
    return null;
  }
  const focused = project.pages[focus].items[0] as DashboardPull | undefined;
  if (focused) {
    return focused;
  }
  return null;
}

export function dashboardEmptyTitle(scopeName: string): string {
  return `${scopeName} 큐가 비어 있습니다`;
}

export function dashboardEmptyDescription(scopeName: string, focus: DashboardQueueFocus): string {
  if (focus === "completed") {
    return `${scopeName}에서 아직 완료된 Folio 리뷰가 없습니다.`;
  }
  if (focus === "yours") {
    return `${scopeName} 범위에 내가 작성한 열린 PR이 없습니다.`;
  }
  return `${scopeName} 범위에 리뷰할 open PR이 없거나 Folio가 아직 분해하지 않았습니다.`;
}

function emptyPage(): DashboardPullPage {
  return { items: [], nextCursor: null, count: 0 };
}
