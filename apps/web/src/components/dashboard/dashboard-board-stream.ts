import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import {
  type DashboardInFlightMap,
  type DashboardRequestEpochs,
  resetDashboardRequestScope,
} from "@/components/dashboard/dashboard-request-scope";
import {
  type BoardStreamEvent,
  type DashboardBucket,
  type DashboardCompletedPull,
  type DashboardOpenBucket,
  type DashboardPull,
  dashboardStreamUrl,
} from "@/lib/dashboard-api";
import { webEnv } from "@/lib/env";

export type ColumnLoadState = {
  items: (DashboardPull | DashboardCompletedPull)[];
  count: number;
  nextCursor: string | null;
  isInitialLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
};

export type ColumnStateMap = Record<DashboardBucket, ColumnLoadState>;

const openBuckets = ["ready", "yours", "other"] satisfies DashboardOpenBucket[];

function emptyColumn(): ColumnLoadState {
  return {
    items: [],
    count: 0,
    nextCursor: null,
    isInitialLoading: true,
    isLoadingMore: false,
    error: null,
  };
}

export function initialColumns(): ColumnStateMap {
  return {
    ready: emptyColumn(),
    yours: emptyColumn(),
    other: emptyColumn(),
    completed: emptyColumn(),
  };
}

export function hasActiveReviewJobs(columns: ColumnStateMap): boolean {
  return Object.values(columns).some((column) =>
    column.items.some(
      (item) => item.analysisStatus === "processing" || item.analysisStatus === "retrying",
    ),
  );
}

export type DashboardReloadOptions = {
  /** Keep existing cards visible; no skeleton wipe. Used for SSE/poll refresh. */
  soft?: boolean;
};

/**
 * Loading UI for a column reset. Soft refresh keeps current cards so background
 * reloads (SSE reconnect, invalidate, active-job poll) do not flash skeleton.
 */
export function columnLoadingStateForReset(
  prev: ColumnLoadState,
  soft: boolean,
): Pick<ColumnLoadState, "items" | "isInitialLoading" | "isLoadingMore" | "error"> {
  if (soft) {
    return {
      items: prev.items,
      isInitialLoading: prev.isInitialLoading,
      isLoadingMore: false,
      error: null,
    };
  }
  return {
    items: [],
    isInitialLoading: true,
    isLoadingMore: false,
    error: null,
  };
}

/**
 * Subscribe to dashboard SSE and apply light patches + debounced open reloads.
 * Returns a cleanup function for the React effect.
 */
export function connectDashboardBoardStream(input: {
  inFlightRef: MutableRefObject<DashboardInFlightMap>;
  requestEpochsRef: MutableRefObject<DashboardRequestEpochs>;
  loadOpenBuckets: (version?: number, options?: DashboardReloadOptions) => Promise<void>;
  setColumns: Dispatch<SetStateAction<ColumnStateMap>>;
}): () => void {
  let cancelled = false;
  let debounceTimer: number | null = null;
  let source: EventSource | null = null;
  // First onopen is the initial connect; mount effects already load open buckets.
  let hasOpened = false;

  const reloadOpenSoon = () => {
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      const openEpoch = resetDashboardRequestScope(
        input.inFlightRef.current,
        input.requestEpochsRef.current,
        "open",
      );
      void input.loadOpenBuckets(openEpoch, { soft: true });
    }, 400);
  };

  const patchCard = (event: Extract<BoardStreamEvent, { type: "pr.upserted" }>) => {
    input.setColumns((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const bucket of openBuckets) {
        const items = prev[bucket].items.map((item) => {
          if (item.id !== event.id || !("updatedAtIso" in item)) {
            return item;
          }
          changed = true;
          return {
            ...item,
            title: event.title ?? item.title,
            author: event.author ?? item.author,
            updatedAtIso: event.githubUpdatedAt,
            additions: event.additions ?? item.additions,
            deletions: event.deletions ?? item.deletions,
            changedFiles: event.changedFiles ?? item.changedFiles,
          };
        });
        next[bucket] = { ...prev[bucket], items };
      }
      return changed ? next : prev;
    });
  };

  const removeCard = (id: string) => {
    input.setColumns((prev) => {
      const next = { ...prev };
      for (const bucket of [...openBuckets, "completed"] as DashboardBucket[]) {
        const items = prev[bucket].items.filter((item) => item.id !== id);
        if (items.length !== prev[bucket].items.length) {
          next[bucket] = {
            ...prev[bucket],
            items,
            count: Math.max(0, prev[bucket].count - 1),
          };
        }
      }
      return next;
    });
  };

  try {
    source = new EventSource(dashboardStreamUrl(webEnv.apiBaseUrl), {
      withCredentials: true,
    });
  } catch {
    return () => undefined;
  }

  source.addEventListener("pr.upserted", (message) => {
    try {
      const event = JSON.parse((message as MessageEvent).data) as BoardStreamEvent;
      if (event.type !== "pr.upserted") {
        return;
      }
      patchCard(event);
      reloadOpenSoon();
    } catch {
      reloadOpenSoon();
    }
  });
  source.addEventListener("pr.removed", (message) => {
    try {
      const event = JSON.parse((message as MessageEvent).data) as BoardStreamEvent;
      if (event.type === "pr.removed") {
        removeCard(event.id);
      }
    } catch {
      /* ignore malformed SSE payloads */
    }
    reloadOpenSoon();
  });
  source.addEventListener("board.invalidate", () => {
    reloadOpenSoon();
  });
  source.onopen = () => {
    if (!hasOpened) {
      hasOpened = true;
      return;
    }
    // Reconnect only: fill gaps without the first-connect double-fetch flash.
    reloadOpenSoon();
  };

  return () => {
    cancelled = true;
    if (debounceTimer !== null) {
      window.clearTimeout(debounceTimer);
    }
    source?.close();
  };
}
