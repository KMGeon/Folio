import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: config.WEB_ORIGIN,
    credentials: true,
  });

  await app.listen(config.PORT);
  console.log(`[folio] backend listening on http://localhost:${config.PORT}`);
}

await bootstrap();
