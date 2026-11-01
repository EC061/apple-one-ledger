"use client";

import { useEffect } from "react";

/** Clear the one-time access-code cookie after the server rendered it. */
export default function ClearFlashCookie() {
  useEffect(() => {
    document.cookie = "a1_access_code=; Max-Age=0; path=/; SameSite=Lax";
  }, []);
  return null;
}
