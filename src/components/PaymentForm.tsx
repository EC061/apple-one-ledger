"use client";

import { useState } from "react";
import { submitPaymentAction } from "@/app/actions/member";
import SubmitButton from "./SubmitButton";
import PaymentAssist from "./PaymentAssist";
import type { ParsedPayment } from "@/lib/payment-parse";

export default function PaymentForm({
  invoiceId,
  amountUsd,
  amountCny,
  rate,
  method,
  methods,
}: {
  invoiceId: string;
  amountUsd: number;
  amountCny: number;
  rate: number;
  method: string | null;
  methods: { value: string; label: string }[];
}) {
  const [currency, setCurrency] = useState<"USD" | "CNY">("USD");
  const [value, setValue] = useState(() => amountUsd.toFixed(2));
  const first = methods[0]?.value ?? "";
  const [selected, setSelected] = useState(() =>
    method && methods.some((entry) => entry.value === method) ? method : first,
  );
  const [txRef, setTxRef] = useState("");
  const [amountSource, setAmountSource] = useState<"default" | "edited" | "assisted">("default");

  function changeCurrency(next: "USD" | "CNY") {
    setCurrency(next);
    setValue((next === "USD" ? amountUsd : amountCny).toFixed(2));
    setAmountSource("default");
  }

  function applyParsed(parsed: ParsedPayment) {
    if (parsed.amount) {
      setCurrency(parsed.currency ?? currency);
      setValue(parsed.amount.toFixed(2));
      setAmountSource("assisted");
    }
    if (parsed.txRef) setTxRef(parsed.txRef);
  }

  return (
    <form action={submitPaymentAction} className="stack-sm">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="amountSource" value={amountSource} />

      <PaymentAssist onFill={applyParsed} />

      <div className="field">
        <span className="label">Currency you sent</span>
        <div className="row" role="radiogroup" aria-label="Currency">
          <label className="check">
            <input
              type="radio"
              name="currency"
              value="USD"
              checked={currency === "USD"}
              onChange={() => changeCurrency("USD")}
            />
            USD
          </label>
          <label className="check">
            <input
              type="radio"
              name="currency"
              value="CNY"
              checked={currency === "CNY"}
              onChange={() => changeCurrency("CNY")}
            />
            CNY
          </label>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="label" htmlFor="amount">
            Amount sent
          </label>
          <input
            id="amount"
            name="amount"
            className="input"
            inputMode="decimal"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setAmountSource("edited");
            }}
            required
          />
          <span className="hint">
            {currency === "USD"
              ? `Equivalent to ¥${amountCny.toFixed(2)} at ${rate.toFixed(4)}`
              : `Equivalent to $${(Number(value || 0) / (rate || 1)).toFixed(2)} at ${rate.toFixed(4)}`}
          </span>
        </div>

        <div className="field">
          <label className="label" htmlFor="method">
            Payment method
          </label>
          <select
            id="method"
            name="method"
            className="select"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {methods.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field full">
          <label className="label" htmlFor="txRef">
            Transaction reference (optional)
          </label>
          <input
            id="txRef"
            name="txRef"
            className="input"
            placeholder="e.g. 4FJ92KQ1"
            value={txRef}
            onChange={(event) => setTxRef(event.target.value)}
          />
          <span className="hint">Helps the admin match your payment if the note was missing.</span>
        </div>

        <div className="field full">
          <label className="label" htmlFor="note">
            Note to the admin (optional)
          </label>
          <textarea id="note" name="note" className="textarea" placeholder="Anything we should know?" />
        </div>
      </div>

      <div className="row">
        <SubmitButton className="btn btn-primary" pending="Reporting payment…">
          I have sent this payment
        </SubmitButton>
        <span className="hint">
          The admin verifies it, or automatic matching clears it if your reference was included.
        </span>
      </div>
    </form>
  );
}
