import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthFacade } from "./application/auth/auth.facade.js";
import { GitHubWebhookFacade } from "./application/github/github-webhook.facade.js";
import { RepoAccessService } from "./domain/auth/repo-access.service.js";
import { SessionService } from "./domain/auth/session.service.js";
import { GitHubWebhookService } from "./domain/github/github-webhook.service.js";
import { GitHubOAuthAdapter } from "./infrastructure/github/github-oauth.adapter.js";
import { GitHubWebhookAdapter } from "./infrastructure/github/github-webhook.adapter.js";
import { AuthController } from "./interfaces/api/auth/auth.controller.js";
import { ApiResponseInterceptor } from "./interfaces/api/common/api-response.interceptor.js";
import { RepoAccessGuard } from "./interfaces/api/common/repo-access.guard.js";
import { SessionAuthGuard } from "./interfaces/api/common/session-auth.guard.js";
import { GitHubWebhookController } from "./interfaces/api/github/github-webhook.controller.js";
import { HealthController } from "./interfaces/api/health/health.controller.js";
import { PullsController } from "./interfaces/api/pulls/pulls.controller.js";
import { InternalModule } from "./internal/internal.module.js";
import { CoreExceptionFilter } from "./support/error/core-exception.filter.js";

@Module({
  imports: [InternalModule],
  controllers: [HealthController, PullsController, GitHubWebhookController, AuthController],
  providers: [
    GitHubWebhookFacade,
    GitHubWebhookService,
    GitHubWebhookAdapter,
    AuthFacade,
    SessionService,
    RepoAccessService,
    GitHubOAuthAdapter,
    SessionAuthGuard,
    RepoAccessGuard,
    {
      provide: APP_FILTER,
      useClass: CoreExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor,
    },
  ],
})
export class AppModule {}
