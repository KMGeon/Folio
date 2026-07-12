import { adminUsersRepo } from "@folio/db";
import type { AdminUserPage, AdminUserStatusFilter, GlobalStatus } from "@folio/types";
import { Inject, Injectable } from "@nestjs/common";
import { decodeAdminPageCursor, encodeAdminPageCursor } from "./admin-page-cursor.js";
import { type GlobalUserCommand, GlobalUsersFacade } from "./global-users.facade.js";

export interface AdminUsersListQuery {
  limit: number;
  q?: string;
  status: AdminUserStatusFilter;
  cursor?: string;
}

@Injectable()
export class AdminUsersFacade {
  constructor(@Inject(GlobalUsersFacade) private readonly commands: GlobalUsersFacade) {}

  async list(query: AdminUsersListQuery): Promise<AdminUserPage> {
    const page = await adminUsersRepo.list({
      limit: query.limit,
      q: query.q,
      status: query.status === "all" ? undefined : (query.status as GlobalStatus),
      cursor: decodeAdminPageCursor(query.cursor),
    });
    const last = page.items.at(-1);

    return {
      items: page.items.map((user) => ({
        id: user.id,
        login: user.login,
        avatarUrl: user.avatarUrl,
        email: user.email,
        globalStatus: user.globalStatus,
        isSystemAdmin: user.isSystemAdmin,
        createdAt: user.createdAt.toISOString(),
      })),
      nextCursor:
        page.hasMore && last
          ? encodeAdminPageCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  approve(command: GlobalUserCommand): Promise<void> {
    return this.commands.approve(command);
  }

  suspend(command: GlobalUserCommand): Promise<void> {
    return this.commands.suspend(command);
  }

  transferSystemAdmin(command: GlobalUserCommand): Promise<void> {
    return this.commands.transferSystemAdmin(command);
  }
}
