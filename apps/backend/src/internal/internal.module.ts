import { Global, Module } from "@nestjs/common";
import { ConsoleLoggerService } from "./logger/console-logger.service.js";
import { LOGGER_PORT } from "./logger/logger.port.js";

@Global()
@Module({
  providers: [
    ConsoleLoggerService,
    {
      provide: LOGGER_PORT,
      useExisting: ConsoleLoggerService,
    },
  ],
  exports: [LOGGER_PORT],
})
export class InternalModule {}
