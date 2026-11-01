"use client";

export default function LanguageToggle({ lang }: { lang: "en" | "zh" }) {
  const next = lang === "en" ? "zh" : "en";

  function toggle() {
    document.cookie = `a1_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={toggle} aria-label="Switch language">
      {lang === "en" ? "中文" : "English"}
    </button>
  );
}
