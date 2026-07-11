import { repositoriesRepo } from "@folio/db";
import type { GitHubRepoAccessLevel } from "@folio/github";
import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RepoAccessService } from "../../../domain/auth/repo-access.service.js";
import { WorkspaceResolver } from "../../../infrastructure/authorization/workspace-resolver.js";
import { CoreException } from "../../../support/error/core-exception.js";
import { ErrorType } from "../../../support/error/error-type.js";
import type { WorkspaceScopedRequest } from "./workspace-role.guard.js";
import { REQUIRE_REPOSITORY_PERMISSION } from "./require-repository-permission.decorator.js";

const REPOSITORY_NOT_FOUND = {
  code: "repository_not_found",
  statusCode: 404,
  message: "Repository not found.",
} as const;

@Injectable()
export class RepositoryPermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RepoAccessService) private readonly access: RepoAccessService,
    @Inject(WorkspaceResolver) private readonly resolver: WorkspaceResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<GitHubRepoAccessLevel>(
      REQUIRE_REPOSITORY_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<WorkspaceScopedRequest>();
    if (!required || !request.user) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }

    const routeOwner = stringValue(request.params?.owner);
    const routeRepo = stringValue(request.params?.repo);
    const body = request.body as Record<string, unknown> | undefined;
    const owner = routeOwner ?? stringValue(body?.owner);
    const repo = routeRepo ?? stringValue(body?.repo);
    if (!owner || !repo) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }

    let bodyWorkspace = null;
    if (!routeOwner || !routeRepo) {
      const repository = await repositoriesRepo.getByFullName(`${owner}/${repo}`);
      if (!repository?.workspaceId) {
        throw new CoreException(REPOSITORY_NOT_FOUND);
      }
      bodyWorkspace = await this.resolver.resolveById(repository.workspaceId);
      if (!bodyWorkspace) {
        throw new CoreException(ErrorType.WorkspaceNotFound);
      }
    }

    const allowed = await this.access.assertLevelAtLeast(
      { owner, repo, username: request.user.login },
      required,
    );
    if (!allowed) {
      throw new CoreException(ErrorType.RepoAccessDenied);
    }
    if (bodyWorkspace) {
      request.workspace = bodyWorkspace;
    }
    return true;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
