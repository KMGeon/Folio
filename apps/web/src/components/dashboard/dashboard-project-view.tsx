import {
  dashboardProjectName,
  type DashboardProjectData,
  type DashboardQueueFocus,
} from "@/components/dashboard/dashboard-project-desk-model";
import { DashboardNoEnabledRepos } from "@/components/dashboard/dashboard-no-enabled-repos";
import { DashboardProjectCockpit } from "@/components/dashboard/dashboard-project-cockpit";
import { DashboardProjectEmpty } from "@/components/dashboard/dashboard-next-up";
import type { DashboardCardProperty, DashboardPull } from "@/lib/dashboard-api";

const EMPTY_COMPLETED_LOADING: Record<string, boolean> = {};

export function DashboardProjectView({
  projects,
  activeRepoId,
  focus,
  onFocusChange,
  visibleProperties,
  onRetryReview,
  onLoadMoreCompleted,
  completedLoadingMore = EMPTY_COMPLETED_LOADING,
}: {
  projects: DashboardProjectData[];
  activeRepoId: string | null;
  focus: DashboardQueueFocus;
  onFocusChange: (focus: DashboardQueueFocus) => void;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
  onLoadMoreCompleted?: (repoId: string) => void;
  completedLoadingMore?: Record<string, boolean>;
}) {
  // `projects` is Settings-enabled only; empty list ⇒ nothing toggled on.
  if (projects.length === 0) {
    return <DashboardNoEnabledRepos />;
  }

  if (activeRepoId) {
    const project = projects.find((candidate) => candidate.repo.id === activeRepoId);
    if (!project) {
      return <DashboardProjectEmpty scopeName="All projects" focus={focus} />;
    }
    const name = dashboardProjectName(project.repo.fullName);
    return (
      <div aria-label={`${name} review desk`}>
        <ProjectDesk
          project={project}
          focus={focus}
          onFocusChange={onFocusChange}
          visibleProperties={visibleProperties}
          onRetryReview={onRetryReview}
          onLoadMoreCompleted={onLoadMoreCompleted}
          isLoadingMoreCompleted={Boolean(completedLoadingMore[project.repo.id])}
        />
      </div>
    );
  }

  return (
    <div aria-label="All projects review sections" className="grid gap-4">
      {projects.map((project) => (
        <ProjectDesk
          key={project.repo.id}
          project={project}
          focus={focus}
          onFocusChange={onFocusChange}
          visibleProperties={visibleProperties}
          onRetryReview={onRetryReview}
          onLoadMoreCompleted={onLoadMoreCompleted}
          isLoadingMoreCompleted={Boolean(completedLoadingMore[project.repo.id])}
        />
      ))}
    </div>
  );
}

function ProjectDesk({
  project,
  focus,
  onFocusChange,
  visibleProperties,
  onRetryReview,
  onLoadMoreCompleted,
  isLoadingMoreCompleted,
}: {
  project: DashboardProjectData;
  focus: DashboardQueueFocus;
  onFocusChange: (focus: DashboardQueueFocus) => void;
  visibleProperties: DashboardCardProperty[];
  onRetryReview: (pull: DashboardPull) => void;
  onLoadMoreCompleted?: (repoId: string) => void;
  isLoadingMoreCompleted: boolean;
}) {
  return (
    <DashboardProjectCockpit
      project={project}
      focus={focus}
      onFocusChange={onFocusChange}
      visibleProperties={visibleProperties}
      onRetryReview={onRetryReview}
      onLoadMoreCompleted={
        onLoadMoreCompleted ? () => onLoadMoreCompleted(project.repo.id) : undefined
      }
      isLoadingMoreCompleted={isLoadingMoreCompleted}
    />
  );
}
