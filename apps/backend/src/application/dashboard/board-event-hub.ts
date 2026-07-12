import { Injectable } from "@nestjs/common";

export type BoardStreamEvent =
  | {
      type: "pr.upserted";
      id: string;
      repoId: string;
      number: number;
      githubUpdatedAt: string;
      title?: string;
      author?: string;
      isDraft?: boolean;
      githubState?: "open" | "closed";
      additions?: number;
      deletions?: number;
      changedFiles?: number;
    }
  | {
      type: "pr.removed";
      id: string;
      repoId: string;
      number: number;
    }
  | {
      type: "board.invalidate";
      reason: "reconcile" | "repo_scope_changed" | "backfill_complete";
      repoId?: string;
    };

export type BoardEventSubscriber = {
  userId: string;
  repoIds: Set<string>;
  send: (event: BoardStreamEvent, eventId: string) => void;
  close: () => void;
};

/**
 * In-process fan-out for dashboard SSE. Interface is pub/sub shaped so a
 * Redis-backed hub can replace it without changing SSE clients.
 */
@Injectable()
export class BoardEventHub {
  private readonly subscribers = new Set<BoardEventSubscriber>();
  private nextEventId = 1;

  subscribe(subscriber: BoardEventSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  publish(event: BoardStreamEvent): void {
    const eventId = String(this.nextEventId++);
    for (const subscriber of this.subscribers) {
      if (event.type === "board.invalidate") {
        if (event.repoId && !subscriber.repoIds.has(event.repoId)) {
          continue;
        }
        subscriber.send(event, eventId);
        continue;
      }
      if (!subscriber.repoIds.has(event.repoId)) {
        continue;
      }
      subscriber.send(event, eventId);
    }
  }

  updateRepoScope(userId: string, repoIds: Iterable<string>): void {
    const next = new Set(repoIds);
    for (const subscriber of this.subscribers) {
      if (subscriber.userId === userId) {
        subscriber.repoIds = next;
      }
    }
  }
}
