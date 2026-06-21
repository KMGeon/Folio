import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { LoggerPort } from "../../internal/logger/logger.port.js";
import { CoreException } from "./core-exception.js";
import { CoreExceptionFilter } from "./core-exception.filter.js";
import { ErrorType } from "./error-type.js";

function createHost(url = "/api/v1/pulls/acme/widget/1/review") {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn().mockReturnThis();
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url }),
      getResponse: () => ({ status, json }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function createFilter() {
  const logger: LoggerPort = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return { filter: new CoreExceptionFilter(logger), logger };
}

describe("CoreExceptionFilter", () => {
  it("keeps explicit CoreException messages because they are public contract text", () => {
    const { filter } = createFilter();
    const { host, status, json } = createHost();

    filter.catch(new CoreException(ErrorType.Unauthorized), host);

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: "unauthorized",
          message: "Authentication is required.",
        },
      }),
    );
  });

  it("does not expose raw unhandled exception messages to clients", () => {
    const { filter, logger } = createFilter();
    const { host, status, json } = createHost();

    filter.catch(new Error("database password=secret failed at 10.0.0.5"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: "internal_error",
          message: "An internal backend error occurred.",
        },
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain("password=secret");
    expect(logger.error).toHaveBeenCalledWith(
      "[folio] unhandled error",
      expect.any(Error),
      expect.objectContaining({ path: "/api/v1/pulls/acme/widget/1/review" }),
    );
  });

  it("sanitizes HttpException messages while preserving status-specific codes", () => {
    const { filter } = createFilter();
    const { host, status, json } = createHost();

    filter.catch(new NotFoundException("No review found for secret-org/private-repo#7"), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: "not_found",
          message: "The requested resource was not found.",
        },
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain("secret-org");
  });

  it("does not expose validation detail arrays from BadRequestException", () => {
    const { filter } = createFilter();
    const { host, status, json } = createHost("/api/v1/pulls");

    filter.catch(new BadRequestException(["owner must be a string", "repo contains token"]), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: {
          code: "bad_request",
          message: "The request is invalid.",
        },
      }),
    );
    expect(JSON.stringify(json.mock.calls)).not.toContain("token");
  });
});
