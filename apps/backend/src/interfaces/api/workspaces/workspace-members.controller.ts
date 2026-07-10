import { WORKSPACE_ROLE, WorkspaceRoleSchema } from "@folio/types";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { WorkspaceMembersFacade } from "../../../application/authorization/workspace-members.facade.js";
import { RequireWorkspaceRole } from "../authorization/require-workspace-role.decorator.js";
import { WorkspaceRoleGuard } from "../authorization/workspace-role.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { type AuthedUser, SessionAuthGuard } from "../common/session-auth.guard.js";

const RoleBodySchema = z.object({ role: WorkspaceRoleSchema });
const TransferBodySchema = z.object({ userId: z.string().trim().min(1) });

@Controller("api/v1/workspaces/:workspaceId/members")
@UseGuards(SessionAuthGuard, WorkspaceRoleGuard)
export class WorkspaceMembersController {
  constructor(
    @Inject(WorkspaceMembersFacade)
    private readonly members: WorkspaceMembersFacade,
  ) {}

  @Get()
  @RequireWorkspaceRole(WORKSPACE_ROLE.REVIEWER)
  async list(@Param("workspaceId") workspaceId: string) {
    return { members: await this.members.list(workspaceId) };
  }

  @Post(":userId/suspend")
  @RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)
  async suspend(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    await this.members.suspend({
      workspaceId,
      actorUserId: user.id,
      targetUserId: userId,
    });
    return { ok: true };
  }

  @Post(":userId/restore")
  @RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)
  async restore(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    await this.members.restore({
      workspaceId,
      actorUserId: user.id,
      targetUserId: userId,
    });
    return { ok: true };
  }

  @Delete(":userId")
  @RequireWorkspaceRole(WORKSPACE_ROLE.ADMIN)
  async remove(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: AuthedUser,
  ) {
    await this.members.remove({
      workspaceId,
      actorUserId: user.id,
      targetUserId: userId,
    });
    return { ok: true };
  }

  @Patch(":userId/role")
  @RequireWorkspaceRole(WORKSPACE_ROLE.OWNER)
  async changeRole(
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const parsed = RoleBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("role must be owner, admin, or reviewer");
    }
    await this.members.changeRole({
      workspaceId,
      actorUserId: user.id,
      targetUserId: userId,
      toRole: parsed.data.role,
    });
    return { ok: true };
  }

  @Post("transfer-ownership")
  @RequireWorkspaceRole(WORKSPACE_ROLE.OWNER)
  async transfer(
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthedUser,
  ) {
    const parsed = TransferBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException("userId is required");
    }
    await this.members.transferOwnership({
      workspaceId,
      actorUserId: user.id,
      targetUserId: parsed.data.userId,
    });
    return { ok: true };
  }
}
