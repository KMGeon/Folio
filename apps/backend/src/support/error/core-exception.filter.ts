import { Catch, HttpException, Inject } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { LOGGER_PORT } from "../../internal/logger/logger.port.js";
import type { LoggerPort } from "../../internal/logger/logger.port.js";
import { CoreException } from "./core-exception.js";
import { ErrorType } from "./error-type.js";

@Catch()
export class CoreExceptionFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER_PORT) private readonly logger: LoggerPort) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest();
    const response = host.switchToHttp().getResponse();

    if (exception instanceof CoreException) {
      return response.status(exception.errorType.statusCode).json({
        success: false,
        error: {
          code: exception.errorType.code,
          message: exception.errorType.message,
        },
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === "object" &&
        exceptionResponse !== null &&
        "message" in exceptionResponse
          ? normalizeMessage((exceptionResponse as { message: unknown }).message)
          : exception.message;
      return response.status(exception.getStatus()).json({
        success: false,
        error: {
          code: "http_exception",
          message,
        },
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.error("[folio] unhandled error", exception, { path: request.url });
    return response.status(ErrorType.InternalError.statusCode).json({
      success: false,
      error: {
        code: ErrorType.InternalError.code,
        message: exception instanceof Error ? exception.message : ErrorType.InternalError.message,
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function normalizeMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message.join(", ");
  }
  if (typeof message === "string") {
    return message;
  }
  return "Request failed.";
}
