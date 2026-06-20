import { webEnv } from "./env.js";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
  path: string;
  timestamp: string;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export class ApiError extends Error {
  constructor(
    readonly response: ApiErrorResponse,
    readonly status: number,
  ) {
    super(response.error.message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit & { baseUrl?: string },
): Promise<T> {
  const { baseUrl = webEnv.apiBaseUrl, ...requestInit } = init ?? {};
  const response = await fetch(new URL(path, baseUrl), {
    ...requestInit,
    headers: {
      accept: "application/json",
      ...requestInit.headers,
    },
  });
  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.success) {
    throw new ApiError(payload, response.status);
  }

  return payload.data;
}
