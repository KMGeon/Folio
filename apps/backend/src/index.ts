import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";
import { bootstrapGitHub } from "./internal/github/github-bootstrap.js";

async function bootstrap() {
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
