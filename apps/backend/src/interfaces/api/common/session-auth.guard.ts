import { USER_STATUS, usersRepo } from "@folio/db";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { SessionService } from "../../../domain/auth/session.service.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";

export interface AuthedUser {
  id: string;
  login: string;
  avatarUrl: string;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = request.cookies?.folio_session;
    const resolved = await this.sessions.resolve(token);
    if (!resolved) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    const user = await usersRepo.getById(resolved.userId);
    if (!user || user.status !== USER_STATUS.APPROVED) {
      throw new CoreException(ErrorType.Unauthorized);
    }
    request.user = { id: user.id, login: user.login, avatarUrl: user.avatarUrl };
    return true;
  }
}
