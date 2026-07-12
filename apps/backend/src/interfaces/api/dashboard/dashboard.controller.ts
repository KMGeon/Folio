import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ENTITLEMENT_FEATURE } from "@folio/types";
import type { Response } from "express";
import {
  type DashboardBucket,
  type DashboardClosedRange,
  type DashboardDirection,
  DashboardFacade,
  type DashboardOrdering,
} from "../../../application/dashboard/dashboard.facade.js";
import { BoardEventHub } from "../../../application/dashboard/board-event-hub.js";
import { loadDashboardWorkspaceScope } from "../../../application/dashboard/dashboard-workspace-scope.js";
import { RepoAccessService } from "../../../domain/auth/repo-access.service.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";
import { EntitlementGuard } from "../authorization/entitlement.guard.js";
import { RequireEntitlement } from "../authorization/require-entitlement.decorator.js";

const buckets = ["ready", "yours", "other", "completed"] as const;
const orderings = ["updated", "lines"] as const;
const directions = ["desc", "asc"] as const;
const closedRanges = ["all", "1d", "7d", "30d", "90d"] as const;

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): T {
  if (value && allowed.includes(value as T)) {
    return value as T;
  }
  throw new BadRequestException(`Invalid ${name}`);
}

function parseOptionalEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  name: string,
): T | undefined {
  if (!value) {
    return undefined;
  }
  return parseEnum(value, allowed, name);
}

function parseLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException("Invalid limit");
  }
  return parsed;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new BadRequestException("Invalid showDrafts");
}

@Controller("api/v1/dashboard")
@UseGuards(SessionAuthGuard, EntitlementGuard)
@RequireEntitlement(ENTITLEMENT_FEATURE.REVIEW_READ)
export class DashboardController {
  constructor(
    // Explicit @Inject token because vitest doesn't emit decorator metadata.
    @Inject(DashboardFacade) private readonly dashboard: DashboardFacade,
    @Inject(BoardEventHub) private readonly boardEvents: BoardEventHub,
    @Inject(RepoAccessService) private readonly repoAccess: RepoAccessService,
  ) {}

  /** Live open PRs across the user's installed repos, with DB review status. */
  @Get()
  async get(@CurrentUser() user: AuthedUser) {
    return this.dashboard.getForUser({ id: user.id, login: user.login });
  }

  @Get("summary")
  async summary(@CurrentUser() user: AuthedUser) {
    return this.dashboard.getSummaryForUser({ id: user.id, login: user.login });
  }

  @Get("pulls/open")
  async openPulls(
    @CurrentUser() user: AuthedUser,
    @Query("limit") limit: string | undefined,
    @Query("q") q: string | undefined,
    @Query("ordering") ordering: string | undefined,
    @Query("direction") direction: string | undefined,
    @Query("showDrafts") showDrafts: string | undefined,
  ) {
    return this.dashboard.getOpenPullPagesForUser(
      { id: user.id, login: user.login },
      {
        limit: parseLimit(limit),
        q,
        ordering: parseOptionalEnum(ordering, orderings, "ordering") as
          | DashboardOrdering
          | undefined,
        direction: parseOptionalEnum(direction, directions, "direction") as
          | DashboardDirection
          | undefined,
        showDrafts: parseBoolean(showDrafts),
      },
    );
  }

  @Get("pulls")
  async pulls(
    @CurrentUser() user: AuthedUser,
    @Query("bucket") bucket: string | undefined,
    @Query("limit") limit: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("q") q: string | undefined,
    @Query("ordering") ordering: string | undefined,
    @Query("direction") direction: string | undefined,
    @Query("closedRange") closedRange: string | undefined,
    @Query("showDrafts") showDrafts: string | undefined,
  ) {
    return this.dashboard.getPullPageForUser(
      { id: user.id, login: user.login },
      {
        bucket: parseEnum(bucket, buckets, "bucket") as DashboardBucket,
        limit: parseLimit(limit),
        cursor,
        q,
        ordering: parseOptionalEnum(ordering, orderings, "ordering") as
          | DashboardOrdering
          | undefined,
        direction: parseOptionalEnum(direction, directions, "direction") as
          | DashboardDirection
          | undefined,
        closedRange: parseOptionalEnum(closedRange, closedRanges, "closedRange") as
          | DashboardClosedRange
          | undefined,
        showDrafts: parseBoolean(showDrafts),
      },
    );
  }

  /**
   * Server-Sent Events stream for near-real-time board updates.
   * Bypasses the JSON envelope interceptor by writing to the raw response.
   */
  @Get("stream")
  async stream(@CurrentUser() user: AuthedUser, @Res() res: Response): Promise<void> {
    const scope = await loadDashboardWorkspaceScope(user.id, user.login, (input) =>
      this.repoAccess.filterReadableResolvedRepositories(input),
    );
    const repoIds = new Set((scope?.repositories ?? []).map((repo) => repo.id));

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    res.write(`: connected\n\n`);

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 20_000);

    const unsubscribe = this.boardEvents.subscribe({
      userId: user.id,
      repoIds,
      send: (event, eventId) => {
        res.write(`id: ${eventId}\n`);
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      close: () => {
        clearInterval(heartbeat);
        res.end();
      },
    });

    res.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
