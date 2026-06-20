import { Injectable } from "@nestjs/common";
import type { LoggerPort } from "./logger.port.js";

@Injectable()
export class ConsoleLoggerService implements LoggerPort {
  info(message: string, context?: Record<string, unknown>) {
    console.info(message, context ?? {});
  }

  warn(message: string, context?: Record<string, unknown>) {
    console.warn(message, context ?? {});
  }

  error(message: string, error?: unknown, context?: Record<string, unknown>) {
    console.error(message, { error, ...context });
  }
}
