import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ReviewModule } from "./application/review/review.module.js";
import { GitHubWebhookFacade } from "./application/github/github-webhook.facade.js";
import { GitHubWebhookService } from "./domain/github/github-webhook.service.js";
import { GitHubWebhookAdapter } from "./infrastructure/github/github-webhook.adapter.js";
import { ApiResponseInterceptor } from "./interfaces/api/common/api-response.interceptor.js";
import { GitHubWebhookController } from "./interfaces/api/github/github-webhook.controller.js";
import { HealthController } from "./interfaces/api/health/health.controller.js";
import { InternalModule } from "./internal/internal.module.js";
import { CoreExceptionFilter } from "./support/error/core-exception.filter.js";

@Module({
  // PullsController moved into ReviewModule to co-locate it with its facades.
  imports: [InternalModule, ReviewModule],
  controllers: [HealthController, GitHubWebhookController],
  providers: [
    GitHubWebhookFacade,
    GitHubWebhookService,
    GitHubWebhookAdapter,
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
