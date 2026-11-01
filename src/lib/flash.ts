import "server-only";
import { cookies } from "next/headers";
import { isHttps } from "./url";

/**
 * Hand a freshly generated access code to the next page view.
 * Readable by JS so a small client component can clear it after the first
 * render; the page itself renders the value server-side (works without JS).
 */
export async function setAccessCodeFlash(code: string) {
  const store = await cookies();
  store.set("a1_access_code", code, {
    httpOnly: false,
    sameSite: "lax",
    secure: await isHttps(),
    path: "/",
    maxAge: 300,
  });
}

export async function readAccessCodeFlash(): Promise<string | null> {
  const store = await cookies();
  return store.get("a1_access_code")?.value ?? null;
}
