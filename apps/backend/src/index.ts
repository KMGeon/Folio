import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";
import { applyPendingMigrations } from "./infrastructure/persistence/apply-pending-migrations.js";
import { bootstrapGitHub } from "./internal/github/github-bootstrap.js";

async function bootstrap() {
  // Schema must land before any request path touches pull_request_index / new columns.
  await applyPendingMigrations("backend");
  bootstrapGitHub();
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(cookieParser());
  app.enableCors({
    origin: config.WEB_ORIGIN,
    credentials: true,
  });

  await app.listen(config.PORT);
  console.log(`[folio] backend listening on http://localhost:${config.PORT}`);
}

await bootstrap();
