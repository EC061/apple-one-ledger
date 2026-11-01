"use client";

import { useState } from "react";
import type { Theme } from "@/lib/theme";

export default function ThemeToggle({ theme, labels }: { theme: Theme; labels: { light: string; dark: string } }) {
  const [current, setCurrent] = useState<Theme>(theme);

  function toggle() {
    const next: Theme = current === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `a1_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setCurrent(next);
  }

  const target = current === "dark" ? labels.light : labels.dark;

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-label={target} title={target}>
      {target}
    </button>
  );
}
