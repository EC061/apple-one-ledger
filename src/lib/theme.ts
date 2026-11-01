import { cookies } from "next/headers";

export type Theme = "dark" | "light";

export const THEME_COOKIE = "a1_theme";

/** Dark is the default; only an explicit cookie flips it. */
export async function getTheme(): Promise<Theme> {
  const store = await cookies();
  return store.get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
}
