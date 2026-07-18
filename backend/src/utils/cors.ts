import { HttpRequest, HttpResponseInit } from "@azure/functions";

const ALLOWED_ORIGINS = [
  "https://kind-tree-0b9f6df00.7.azurestaticapps.net",
  "https://galatayo.app",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
];

const DEFAULT_ORIGIN = ALLOWED_ORIGINS[0];

function resolveOrigin(requestOrigin: string | null): string {
  if (!requestOrigin) return DEFAULT_ORIGIN;
  if (ALLOWED_ORIGINS.includes(requestOrigin)) return requestOrigin;
  return DEFAULT_ORIGIN;
}

export function buildCorsHeaders(origin?: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(origin ?? null),
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, x-request-id, x-trace-id",
    "Access-Control-Max-Age": "86400",
  };
}

export function addCorsToResponse(
  response: HttpResponseInit,
  requestOrigin?: string | null
): HttpResponseInit {
  return {
    ...response,
    headers: {
      ...response.headers,
      ...buildCorsHeaders(requestOrigin ?? null),
    },
  };
}
