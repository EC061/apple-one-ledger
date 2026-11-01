import Link from "next/link";
import { formatDate, formatDateTime, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS, priceFor } from "@/lib/pricing";
import { MethodBadge } from "@/components/ui";
import PaymentForm from "@/components/PaymentForm";
import CopyButton from "@/components/CopyButton";
import { Notice } from "@/components/ui";
import type { Settings } from "@/lib/settings";
import type { Invoice } from "@/lib/types";

export function PayDestinations({
  settings,
  invoice,
  methodRows,
}: {
  settings: Settings;
  invoice: Invoice;
  methodRows: { key: string; label: string; value: string; qr?: string }[];
}) {
  const pay = settings.payments;
  return (
            <div className="stack pay-destinations">
              <div className="card">
                <div className="card-head">
                  <h2>Where to send it</h2>
                </div>
                <div className="card-body stack-sm">
                  {pay.instructions ? (
                    <div className="notice" style={{ whiteSpace: "pre-wrap" }}>
                      {pay.instructions}
                    </div>
                  ) : null}

                  {methodRows.filter((item) => item.value).map((item) => (
                    <div key={item.key} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
                      <div className="row-between">
                        <span className="strong small">{item.label}</span>
                        {item.value ? (
                          <span className="row" style={{ gap: 6 }}>
                            <span className="mono small">{item.value}</span>
                            <CopyButton value={item.value} label="Copy" />
                          </span>
                        ) : (
                          <span className="muted small">not configured</span>
                        )}
                      </div>
                      {item.qr ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.qr} alt={`${item.label} QR code`} className="qr" style={{ marginTop: 8 }} />
                      ) : null}
                    </div>
                  ))}

                  <p className="hint" style={{ marginBottom: 0 }}>
                    Always include <strong className="mono">{invoice.reference}</strong> in the note. That is how
                    automatic matching finds your payment.
                  </p>
                </div>
              </div>

              <div className="card card-pad">
                <h3>Locked rate</h3>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  CNY amounts use the USD→CNY rate on the day the invoice was issued ({invoice.fx_date}). This one is
                  locked at <strong>1 USD = {invoice.fx_rate.toFixed(4)} CNY</strong>, so what you see is what you pay.
                </p>
              </div>

              <div className="notice small">
                Rate source: {settings.fx.provider === "manual" ? "manual override set by the admin" : "daily reference rate (ECB via frankfurter.app)"}.
                {settings.automation.autoVerify
                  ? " Payments that match the reference and amount are confirmed automatically."
                  : " Every payment is confirmed by the admin."}
              </div>
            </div>
  );
}


export function PayStatusNotices({ invoice, settings }: { invoice: Invoice; settings: Settings }) {
  return (
    <>
          {invoice.status === "submitted" ? (
            <Notice tone="warn">
              You reported this payment — the admin still needs to confirm it. You will get an email receipt once it
              is recorded.
            </Notice>
          ) : null}
          {invoice.status === "paid" ? (
            <Notice tone="ok">
              This invoice is paid{invoice.paid_at ? ` on ${formatDateTime(invoice.paid_at, settings.plan.timezone)}` : ""}.
              Coverage runs to {formatDate(invoice.period_end)}.
            </Notice>
          ) : null}
          {invoice.status === "void" ? <Notice tone="error">This invoice was voided and no payment is due.</Notice> : null}
    </>
  );
}


export function PayAmountCard({ invoice, settings }: { invoice: Invoice; settings: Settings }) {
  return (
              <div className="card">
                <div className="card-body">
                  <div className="row-between">
                    <div>
                      <div className="stat-label">Amount due</div>
                      <div className="stat-value" style={{ fontSize: 32 }}>
                        {formatMoney(invoice.amount_usd)}
                      </div>
                      <div className="muted small">
                        or ¥{invoice.amount_cny.toFixed(2)} at 1 USD = {invoice.fx_rate.toFixed(4)} CNY
                      </div>
                      <div className="small" style={{ marginTop: 8 }}>
                        <strong>
                          Renews at {formatMoney(priceFor(invoice.plan, invoice.term_index + 1, settings.pricing))}
                        </strong>{" "}
                        {PLANS[invoice.plan].label.toLowerCase()} from {formatDate(invoice.period_end)}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="stat-label">Due</div>
                      <div className="strong">{formatDate(invoice.due_date)}</div>
                      <div className="muted small">({relativeDays(invoice.due_date, settings.plan.timezone)})</div>
                    </div>
                  </div>

                  <hr />

                  <div className="row-between">
                    <div>
                      <div className="stat-label">Reference — put this in the payment note</div>
                      <div className="mono" style={{ fontSize: 20, letterSpacing: "0.1em" }}>
                        {invoice.reference}
                      </div>
                    </div>
                    <CopyButton value={invoice.reference} label="Copy reference" />
                  </div>

                  <hr />

                  <dl className="dt small">
                    <dt>Pricing</dt>
                    <dd>{invoice.term_index <= 1 ? "First term (introductory price)" : `Renewal (term ${invoice.term_index})`}</dd>
                    <dt>This term</dt>
                    <dd>
                      {formatMoney(invoice.amount_usd)} now
                      {invoice.term_index <= 1 ? " (introductory)" : " (renewal)"}
                    </dd>
                    <dt>Next renewal</dt>
                    <dd>
                      {formatMoney(priceFor(invoice.plan, invoice.term_index + 1, settings.pricing))} after{" "}
                      {formatDate(invoice.period_end)}
                    </dd>
                    <dt>FX rate</dt>
                    <dd>
                      1 USD = {invoice.fx_rate.toFixed(4)} CNY · locked {invoice.fx_date}
                    </dd>
                    <dt>Method</dt>
                    <dd>
                      <MethodBadge method={invoice.method} />
                    </dd>
                    {invoice.paid_at ? (
                      <>
                        <dt>Recorded</dt>
                        <dd>{formatDateTime(invoice.paid_at, settings.plan.timezone)}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </div>
  );
}

export function PayActionPanel({
  invoice,
  isAdminView,
  configuredMethods,
}: {
  invoice: Invoice;
  isAdminView: boolean;
  configuredMethods: { value: string; label: string }[];
}) {
  const canPay = invoice.status === "awaiting_payment" || invoice.status === "overdue";
  return (
    <>
              {canPay ? (
                <div className="card">
                  <div className="card-head">
                    <h2>Report your payment</h2>
                  </div>
                  <div className="card-body">
                    {isAdminView ? (
                      <Notice>
                        You are viewing this as the admin. Use{" "}
                        <Link href="/admin/invoices">Invoices → Mark paid</Link> to record it.
                      </Notice>
                    ) : configuredMethods.length === 0 ? (
                      <Notice tone="warn">
                        The admin has not published payment details yet. Ask them to fill in WeChat / Alipay / Venmo /
                        Zelle under Admin → Settings → Payment details.
                      </Notice>
                    ) : (
                      <PaymentForm
                        invoiceId={invoice.id}
                        amountUsd={invoice.amount_usd}
                        amountCny={invoice.amount_cny}
                        rate={invoice.fx_rate}
                        method={invoice.method}
                        methods={configuredMethods}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="card card-pad">
                  <h2>Nothing to do</h2>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    This invoice is {invoice.status.replace("_", " ")}.{" "}
                    {invoice.status === "paid" ? `Your coverage runs until ${formatDate(invoice.period_end)}.` : ""}
                    {invoice.status === "submitted"
                      ? " If you reported the wrong amount or method, ask the admin to correct or void it."
                      : ""}
                  </p>
                  <Link href={isAdminView ? "/admin/invoices" : "/dashboard"} className="btn btn-secondary">
                    Back to {isAdminView ? "invoices" : "dashboard"}
                  </Link>
                </div>
              )}
    </>
  );
}
