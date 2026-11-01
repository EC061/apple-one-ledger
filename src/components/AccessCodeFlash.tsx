"use client";

import { useEffect, useState } from "react";
import CopyButton from "./CopyButton";

function readCookie(name: string): string | null {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return null;
}

export default function AccessCodeFlash({ label = "Your new access code" }: { label?: string }) {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    const value = readCookie("a1_access_code");
    if (!value) return;
    document.cookie = "a1_access_code=; Max-Age=0; path=/; SameSite=Lax";
    setCode(value);
  }, []);

  if (!code) return null;

  return (
    <div className="notice notice-ok" style={{ marginBottom: 18 }}>
      <div className="row-between" style={{ gap: 12 }}>
        <div>
          <div className="strong" style={{ marginBottom: 4 }}>
            {label} — save it now
          </div>
          <div className="small">This is shown once. Use it to sign in on any device.</div>
        </div>
        <CopyButton value={code} label="Copy code" />
      </div>
      <div className="code-box" style={{ marginTop: 10, background: "#fff" }}>
        {code}
      </div>
    </div>
  );
}
