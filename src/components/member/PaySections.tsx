import Link from "next/link";
import { formatDate, formatDateTime, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS, priceFor } from "@/lib/pricing";
import { MethodBadge } from "@/components/ui";
import PaymentForm from "@/components/PaymentForm";
import CopyButton from "@/components/CopyButton";
import { Notice } from "@/components/ui";
import type { Settings } from "@/lib/settings";
import type { PaymentDestination } from "@/lib/payment-destinations";
import type { Invoice } from "@/lib/types";

export function PaymentMethodsCard({
  settings,
  methodRows,
  reference,
}: {
  settings: Settings;
  methodRows: PaymentDestination[];
  reference?: string | null;
}) {
  const pay = settings.payments;
  const configured = methodRows.filter((item) => item.value || item.qr);

  return (
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

        {configured.length === 0 ? (
          <p className="muted small" style={{ marginBottom: 0 }}>
            No payment details are configured yet. Add them under Settings → Payment details.
          </p>
        ) : (
          configured.map((item) => (
            <div key={item.key} style={{ borderBottom: "1px solid var(--line)", paddingBottom: 10 }}>
              <div className="row-between">
                <span className="strong small">{item.label}</span>
                {item.value ? (
                  <span className="row" style={{ gap: 6 }}>
                    <span className="mono small">{item.value}</span>
                    <CopyButton value={item.value} label="Copy" />
                  </span>
                ) : item.qr ? (
                  <span className="muted small">Scan the QR to pay</span>
                ) : null}
              </div>
              {item.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.qr} alt={`${item.label} QR code`} className="qr" style={{ marginTop: 8 }} />
              ) : null}
            </div>
          ))
        )}

        {reference ? (
          <p className="hint" style={{ marginBottom: 0 }}>
            Always include <strong className="mono">{reference}</strong> in the note so the admin can match your
            payment.
          </p>
        ) : (
          <p className="hint" style={{ marginBottom: 0 }}>
            The payment reference appears here once the member has an open invoice.
          </p>
        )}
      </div>
    </div>
  );
}

export function PayDestinations({
  settings,
  invoice,
  methodRows,
  fxRate,
  fxDate,
}: {
  settings: Settings;
  invoice: Invoice;
  methodRows: PaymentDestination[];
  fxRate: number;
  fxDate: string;
}) {
  return (
            <div className="stack pay-destinations">
              <PaymentMethodsCard settings={settings} methodRows={methodRows} reference={invoice.reference} />

              <div className="card card-pad">
                <h3>Payment-day rate</h3>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  {invoice.status === "paid" ? (
                    <>
                      This invoice was settled at <strong>1 USD = {fxRate.toFixed(4)} CNY</strong> ({fxDate}).
                    </>
                  ) : (
                    <>
                      CNY uses the USD→CNY rate on the day the payment is recorded. The rate shown is{" "}
                      <strong>1 USD = {fxRate.toFixed(4)} CNY</strong> ({fxDate}); the CNY figure above is an
                      estimate until then.
                    </>
                  )}
                </p>
              </div>

              <div className="notice small">
                Rate source: {settings.fx.provider === "manual" ? "manual override set by the admin" : "daily reference rate (ECB via frankfurter.app)"}.
                Every payment is confirmed by the admin.
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


export function PayAmountCard({
  invoice,
  settings,
  amountCny,
  fxRate,
}: {
  invoice: Invoice;
  settings: Settings;
  amountCny: number;
  fxRate: number;
}) {
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
                        or {invoice.status === "paid" ? "" : "≈"}¥{amountCny.toFixed(2)} at 1 USD = {fxRate.toFixed(4)} CNY
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
                    <dt>FX rate</dt>
                    <dd>
                      1 USD = {fxRate.toFixed(4)} CNY · payment-day reference
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
  amountCny,
  fxRate,
}: {
  invoice: Invoice;
  isAdminView: boolean;
  configuredMethods: { value: string; label: string }[];
  amountCny: number;
  fxRate: number;
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
                        amountCny={amountCny}
                        rate={fxRate}
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
