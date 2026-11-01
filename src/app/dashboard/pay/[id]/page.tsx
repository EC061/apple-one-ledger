import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS } from "@/lib/pricing";
import TopBar from "@/components/TopBar";
import PaymentForm from "@/components/PaymentForm";
import CopyButton from "@/components/CopyButton";
import { MethodBadge, Notice, StatusBadge } from "@/components/ui";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  method: "Choose a valid payment method.",
  amount: "Enter an amount greater than zero.",
};

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as unknown as Invoice | undefined;
  if (!invoice) notFound();
  if (invoice.user_id !== user.id && user.role !== "admin") notFound();

  const settings = getSettings();
  const pay = settings.payments;
  const canPay = invoice.status === "awaiting_payment" || invoice.status === "overdue";
  const isAdminView = user.role === "admin";

  const methods = [
    { key: "venmo", label: "Venmo", value: pay.venmoHandle ? `@${pay.venmoHandle}` : "" },
    { key: "zelle", label: "Zelle", value: pay.zelleEmail },
    { key: "wechat", label: "WeChat Pay", value: pay.wechatId, qr: pay.wechatQrUrl },
    { key: "alipay", label: "Alipay", value: pay.alipayId, qr: pay.alipayQrUrl },
  ];

  return (
    <div className="page">
      <TopBar user={user} area={isAdminView ? "admin" : "member"} />
      <main className="grow">
        <div className="container stack">
          <div className="row-between">
            <div>
              <div className="row small muted" style={{ marginBottom: 2 }}>
                <Link href={isAdminView ? "/admin/invoices" : "/dashboard"}>← Back</Link>
              </div>
              <h1>Pay your share</h1>
              <p className="muted" style={{ marginBottom: 0 }}>
                {PLANS[invoice.plan].label} · {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
              </p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          {error ? <Notice tone="error">{ERRORS[error] ?? error}</Notice> : null}

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

          <div className="split">
            <div className="stack">
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

              {canPay ? (
                <div className="card">
                  <div className="card-head">
                    <h2>Report your payment</h2>
                  </div>
                  <div className="card-body">
                    <PaymentForm
                      invoiceId={invoice.id}
                      amountUsd={invoice.amount_usd}
                      amountCny={invoice.amount_cny}
                      rate={invoice.fx_rate}
                      method={invoice.method}
                    />
                  </div>
                </div>
              ) : (
                <div className="card card-pad">
                  <h2>Nothing to do</h2>
                  <p className="muted small" style={{ marginBottom: 12 }}>
                    This invoice is {invoice.status.replace("_", " ")}.{" "}
                    {invoice.status === "paid" ? `Your coverage runs until ${formatDate(invoice.period_end)}.` : ""}
                  </p>
                  <Link href={isAdminView ? "/admin/invoices" : "/dashboard"} className="btn btn-secondary">
                    Back to {isAdminView ? "invoices" : "dashboard"}
                  </Link>
                </div>
              )}
            </div>

            <div className="stack">
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

                  {methods.map((item) => (
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
                <h3>Today&apos;s rate</h3>
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
          </div>
        </div>
      </main>
    </div>
  );
}
