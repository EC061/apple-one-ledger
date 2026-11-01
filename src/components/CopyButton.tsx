"use client";

import { useState } from "react";

export default function CopyButton({
  value,
  label = "Copy",
  className = "btn btn-secondary btn-sm",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" className={className} onClick={copy} aria-live="polite">
      {copied ? "Copied" : label}
    </button>
  );
}
