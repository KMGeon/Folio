import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { map } from "rxjs";
import type { Observable } from "rxjs";
import { successResponse } from "./api-response.js";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data: unknown) => {
        if (isApiResponse(data)) {
          return data;
        }
        return successResponse(data);
      }),
    );
  }
}

function isApiResponse(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  return "success" in data && typeof (data as { success?: unknown }).success === "boolean";
}
