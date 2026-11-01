import { headers } from "next/headers";

/**
 * Public base URL of this deployment.
 *
 * Order of precedence:
 *  1. APP_URL (set this when you have a fixed domain)
 *  2. X-Forwarded-Proto / X-Forwarded-Host from your reverse proxy
 *  3. Host header
 *
 * Invite links are generated from this value, so they always match the
 * HTTPS address the member is actually using.
 */
export async function getBaseUrl(): Promise<string> {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const h = await headers();
  const proto = firstValue(h.get("x-forwarded-proto")) || "http";
  const host = firstValue(h.get("x-forwarded-host")) || firstValue(h.get("host")) || "localhost:3000";
  return `${proto}://${host}`;
}

export async function isHttps(): Promise<boolean> {
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.startsWith("https://");
  const h = await headers();
  return firstValue(h.get("x-forwarded-proto")) === "https";
}

function firstValue(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0].trim();
}

export function requestMeta() {
  return headers().then((h) => ({
    ip: firstValue(h.get("x-forwarded-for")) || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent"),
  }));
}
