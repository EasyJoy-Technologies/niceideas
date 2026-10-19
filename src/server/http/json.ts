import { NextResponse } from "next/server";

/** Machine-readable API error codes only; clients localize by code (design §6). */
export type ApiErrorBody = { error: { code: string; status: number; details?: unknown } };

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonOk<T>(data: T, status = 200, headers?: HeadersInit): NextResponse<T> {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headersToObject(headers) } });
}

export function jsonError(code: string, status: number, details?: unknown, headers?: HeadersInit): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: details === undefined ? { code, status } : { code, status, details } };
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...headersToObject(headers) } });
}

function headersToObject(headers?: HeadersInit): Record<string, string> {
  return headers ? Object.fromEntries(new Headers(headers).entries()) : {};
}
