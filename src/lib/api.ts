import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

function constantTimeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

/** Validate `Authorization: Bearer <token>` against an environment secret. */
export function bearerAuthorized(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 8) return false;
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  return constantTimeEqual(token, secret);
}

export function cronAuthorized(request: Request, secret: string | undefined): boolean {
  return bearerAuthorized(request, secret);
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
