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

  try {
    const h = await headers();
    const proto = firstValue(h.get("x-forwarded-proto")) || "http";
    const host = firstValue(h.get("x-forwarded-host")) || firstValue(h.get("host")) || "localhost:3000";
    return `${proto}://${host}`;
  } catch {
    // Background job without a request (scheduler + no APP_URL).
    return `http://127.0.0.1:${process.env.PORT || 3000}`;
  }
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
  return headers()
    .then((h) => ({
      ip: clientIp(h.get("x-forwarded-for"), h.get("x-real-ip")),
      userAgent: h.get("user-agent"),
    }))
    .catch(() => ({ ip: null, userAgent: null }));
}

/**
 * Single reverse proxy assumed: the right-most X-Forwarded-For entry is the
 * one your proxy added. x-real-ip wins when present.
 */
function clientIp(forwarded: string | null, realIp: string | null): string | null {
  if (realIp) return realIp;
  if (!forwarded) return null;
  const parts = forwarded.split(",").map((value) => value.trim()).filter(Boolean);
  return parts[parts.length - 1] || null;
}
