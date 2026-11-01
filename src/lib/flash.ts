"use server";
import { cookies } from "next/headers";

/**
 * Hand a freshly generated access code to the next page view.
 * Deliberately readable by JS: a small client component copies it into
 * component state and immediately deletes the cookie.
 */
export async function setAccessCodeFlash(code: string) {
  const store = await cookies();
  store.set("a1_access_code", code, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
}
