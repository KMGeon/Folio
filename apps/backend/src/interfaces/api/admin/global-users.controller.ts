import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { GlobalUsersFacade } from "../../../application/authorization/global-users.facade.js";
import { SystemAdminGuard } from "../authorization/system-admin.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

const TransferBodySchema = z.object({ userId: z.string().trim().min(1) });

@Controller("api/v1/admin")
@UseGuards(SessionAuthGuard, SystemAdminGuard)
export class GlobalUsersController {
  constructor(@Inject(GlobalUsersFacade) private readonly users: GlobalUsersFacade) {}

  @Get("users")
  async list() {
    const users = await this.users.list();
    return {
      users: users.map((user) => ({
        id: user.id,
        login: user.login,
        avatarUrl: user.avatarUrl,
        email: user.email,
        globalStatus: user.globalStatus,
        isSystemAdmin: user.isSystemAdmin,
        createdAt: user.createdAt,
      })),
    };
  }

  @Post("users/:id/approve")
  async approve(@CurrentUser() user: AuthedUser, @Param("id") id: string) {
    await this.users.approve({ actorUserId: user.id, targetUserId: id });
    return { ok: true };
  }

  @Post("users/:id/suspend")
  async suspend(@CurrentUser() user: AuthedUser, @Param("id") id: string) {
    await this.users.suspend({ actorUserId: user.id, targetUserId: id });
    return { ok: true };
  }

  @Post("system-admin/transfer")
  async transfer(@CurrentUser() user: AuthedUser, @Body() body: unknown) {
    const parsed = TransferBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("userId is required");
    }
    await this.users.transferSystemAdmin({
      actorUserId: user.id,
      targetUserId: parsed.data.userId,
    });
    return { ok: true };
  }
}
