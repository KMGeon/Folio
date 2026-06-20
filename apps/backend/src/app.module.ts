import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AuthModule } from "./application/auth/auth.module.js";
import { DashboardModule } from "./application/dashboard/dashboard.module.js";
import { GitHubWebhookFacade } from "./application/github/github-webhook.facade.js";
import { InstallationSyncFacade } from "./application/github/installation-sync.facade.js";
import { ReviewModule } from "./application/review/review.module.js";
import { GitHubWebhookService } from "./domain/github/github-webhook.service.js";
import { GitHubWebhookAdapter } from "./infrastructure/github/github-webhook.adapter.js";
import { ReviewJobQueue } from "./infrastructure/persistence/review-job-queue.js";
import { ApiResponseInterceptor } from "./interfaces/api/common/api-response.interceptor.js";
import { GitHubWebhookController } from "./interfaces/api/github/github-webhook.controller.js";
import { HealthController } from "./interfaces/api/health/health.controller.js";
import { InternalModule } from "./internal/internal.module.js";
import { CoreExceptionFilter } from "./support/error/core-exception.filter.js";

@Module({
  // PullsController lives in ReviewModule; AuthModule owns the OAuth/session stack.
  imports: [InternalModule, ReviewModule, AuthModule, DashboardModule],
  controllers: [HealthController, GitHubWebhookController],
  providers: [
    GitHubWebhookFacade,
    GitHubWebhookService,
    GitHubWebhookAdapter,
    InstallationSyncFacade,
    ReviewJobQueue,
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
