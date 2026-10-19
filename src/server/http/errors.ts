/**
 * Expected, client-facing failure. `code` is a stable machine-readable key
 * (clients localize it); `details` must never contain secrets.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: unknown,
    readonly headers?: HeadersInit,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const unauthorized = (code = "auth.invalid_token") => new ApiError(code, 401, undefined, { "WWW-Authenticate": "Bearer" });
export const forbidden = (code: string) => new ApiError(code, 403);
export const notFound = (code: string) => new ApiError(code, 404);
export const badRequest = (code: string, details?: unknown) => new ApiError(code, 400, details);
export const conflict = (code: string, details?: unknown) => new ApiError(code, 409, details);
