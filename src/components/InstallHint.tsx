"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "a1-install-dismissed";

/** iOS Safari has no install prompt; the only path is Share → Add to Home Screen. */
export default function InstallHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!isIos || standalone) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="notice" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div className="small" style={{ flex: 1 }}>
        <strong>Install on your iPhone.</strong> Tap the Share button, then{" "}
        <strong>Add to Home Screen</strong> — it opens full-screen as “A1 Ledger”.
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          localStorage.setItem(DISMISS_KEY, "1");
          setShow(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
