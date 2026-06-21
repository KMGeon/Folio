import { Catch, HttpException, HttpStatus, Inject } from "@nestjs/common";
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
      const error = publicHttpError(exception.getStatus());
      return response.status(exception.getStatus()).json({
        success: false,
        error,
        path: request.url,
        timestamp: new Date().toISOString(),
      });
    }

    this.logger.error("[folio] unhandled error", exception, { path: request.url });
    return response.status(ErrorType.InternalError.statusCode).json({
      success: false,
      error: {
        code: ErrorType.InternalError.code,
        message: ErrorType.InternalError.message,
      },
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function publicHttpError(statusCode: number): { code: string; message: string } {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return { code: "bad_request", message: "The request is invalid." };
    case HttpStatus.UNAUTHORIZED:
      return { code: "unauthorized", message: "Authentication is required." };
    case HttpStatus.FORBIDDEN:
      return { code: "forbidden", message: "You do not have permission to perform this action." };
    case HttpStatus.NOT_FOUND:
      return { code: "not_found", message: "The requested resource was not found." };
    case HttpStatus.METHOD_NOT_ALLOWED:
      return { code: "method_not_allowed", message: "This request method is not allowed." };
    case HttpStatus.CONFLICT:
      return { code: "conflict", message: "The request conflicts with the current state." };
    case HttpStatus.TOO_MANY_REQUESTS:
      return { code: "too_many_requests", message: "Too many requests. Please try again later." };
    default:
      if (statusCode >= 500) {
        return { code: ErrorType.InternalError.code, message: ErrorType.InternalError.message };
      }
      return { code: "request_failed", message: "The request could not be completed." };
  }
}
