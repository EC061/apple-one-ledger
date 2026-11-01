"use client";

import { useState } from "react";
import { parsePaymentText, type ParsedPayment } from "@/lib/payment-parse";
import { Notice } from "./ui";

export default function PaymentAssist({ onFill }: { onFill: (parsed: ParsedPayment) => void }) {
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<ParsedPayment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);

  async function scan(file: File) {
    setBusy(true);
    setError(null);
    setParsed(null);
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("/api/ocr", { method: "POST", body });
      if (!response.ok) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(detail?.error || `Could not read that screenshot (HTTP ${response.status}).`);
        return;
      }

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        parsed?: ParsedPayment;
      } | null;
      if (!data?.ok || !data.parsed) {
        setError(data?.error || "Could not read that screenshot.");
        return;
      }
      setParsed(data.parsed);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assist">
      <div className="row-between">
        <strong className="small">Scan a payment screenshot</strong>
        <span className="muted small">optional</span>
      </div>
      <p className="hint" style={{ margin: "4px 0 10px" }}>
        Pick the WeChat / Alipay / Venmo / Zelle receipt from your photos. The image is read on this
        server and deleted immediately — it is never stored or attached to your payment.
      </p>

      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="input"
        aria-label="Payment screenshot"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void scan(file);
        }}
      />

      {busy ? (
        <p className="hint" style={{ marginTop: 8 }}>
          Reading the screenshot…
        </p>
      ) : null}
      {error ? (
        <div style={{ marginTop: 10 }}>
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
      {parsed ? <ScanSummary parsed={parsed} onUse={() => onFill(parsed)} /> : null}

      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 6, paddingLeft: 0 }}
        onClick={() => setShowPaste((value) => !value)}
        aria-expanded={showPaste}
      >
        {showPaste ? "Hide pasted text" : "Or paste the payment text (iOS Live Text)"}
      </button>

      {showPaste ? <PastePanel onParsed={setParsed} onError={setError} /> : null}
    </div>
  );
}

function ScanSummary({ parsed, onUse }: { parsed: ParsedPayment; onUse: () => void }) {
  return (
    <div className="notice notice-ok" style={{ marginTop: 10 }}>
      <div className="row-between" style={{ gap: 10 }}>
        <div className="small">
          {parsed.amount ? (
            <div>
              <strong>
                {parsed.currency === "CNY" ? "¥" : parsed.currency === "USD" ? "$" : ""}
                {parsed.amount.toFixed(2)}
              </strong>
              {parsed.currency ? ` ${parsed.currency}` : ""}
              {parsed.txRef ? ` · ref ${parsed.txRef}` : ""}
            </div>
          ) : (
            <div>No amount found — enter it manually.</div>
          )}
          {parsed.reference ? <div className="muted">Invoice {parsed.reference}</div> : null}
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onUse}>
          Use these
        </button>
      </div>
    </div>
  );
}

function PastePanel({
  onParsed,
  onError,
}: {
  onParsed: (parsed: ParsedPayment) => void;
  onError: (message: string | null) => void;
}) {
  const [text, setText] = useState("");

  function read() {
    onError(null);
    const result = parsePaymentText(text);
    if (!result.amount && !result.txRef && !result.reference) {
      onError("No amount or transaction number found in that text. You can still type them below.");
      return;
    }
    onParsed(result);
  }

  return (
    <div className="stack-sm">
      <textarea
        className="textarea"
        placeholder="Long-press the screenshot → Copy Text → paste here"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Paste payment text"
      />
      <button type="button" className="btn btn-secondary btn-sm" onClick={read} disabled={!text.trim()}>
        Read pasted text
      </button>
    </div>
  );
}
