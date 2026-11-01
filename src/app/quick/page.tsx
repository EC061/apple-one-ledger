import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, relativeDays, today } from "@/lib/dates";
import { PLANS, PLAN_ORDER, priceFor } from "@/lib/pricing";
import { nextTermIndex } from "@/lib/billing";
import { quickMarkPaidAction, quickUploadQrAction } from "@/app/actions/quick";
import { logoutAction } from "@/app/actions/auth";
import { Brand, Notice, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { InvoiceStatus, Plan, User } from "@/lib/types";

export const metadata: Metadata = {
  title: "Quick control",
  description: "Record payments and update payment QR codes from your phone.",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  member: "That member is not active.",
  input: "Check the plan, method and amount.",
  fx: "No USD→CNY rate available; set a manual rate in Settings.",
  proof: "Proof must be a PNG, JPG or WebP under 5 MB.",
  qr: "QR must be a PNG, JPG or WebP under 5 MB.",
  invoice: "Could not create the invoice. Check the rate or member.",
  payment: "Could not record the payment. Check the amount and invoice status.",
};

interface QuickRow extends User {
  open_id: string | null;
  open_plan: Plan | null;
  open_amount: number | null;
  open_status: InvoiceStatus | null;
  open_ref: string | null;
  open_term: number | null;
  open_due: string | null;
}

export default async function QuickPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const settings = getSettings();
  const day = today(settings.plan.timezone);

  const rows = db()
    .prepare(
      `SELECT u.*, i.id AS open_id, i.plan AS open_plan, i.amount_usd AS open_amount,
              i.status AS open_status, i.reference AS open_ref, i.term_index AS open_term, i.due_date AS open_due
       FROM users u
       LEFT JOIN invoices i ON i.user_id = u.id AND i.status IN ('awaiting_payment','submitted','overdue')
       WHERE u.status = 'active' AND u.role = 'member'
       ORDER BY u.name`,
    )
    .all() as unknown as QuickRow[];

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand subtitle="Quick control" />
          <div className="topbar-right">
            <Link href="/admin" className="btn btn-ghost btn-sm">
              Full admin
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="grow">
        <div className="container stack" style={{ maxWidth: 960 }}>
          {params.saved === "paid" ? <Notice tone="ok">Payment recorded and receipt queued.</Notice> : null}
          {params.saved === "qr" ? <Notice tone="ok">Payment QR updated.</Notice> : null}
          {params.error ? (
            <Notice tone="error">{ERRORS[params.error] ?? "Something went wrong. Try again."}</Notice>
          ) : null}

          <div>
            <h1>Quick control</h1>
            <p className="muted" style={{ marginBottom: 0 }}>
              Who paid what, with which plan, plus proof and payment QR — built for the installed app.
            </p>
          </div>

          <div className="quick-grid">
            {rows.map((row) => {
              const termIndex = row.open_term ?? nextTermIndex(row.id);
              const defaultPlan: Plan = row.open_plan ?? "quarterly";
              const defaultAmount = row.open_amount ?? priceFor(defaultPlan, termIndex, settings.pricing);
              const covered = row.paid_through ? row.paid_through >= day : false;
              return (
                <form key={row.id} action={quickMarkPaidAction} className="card card-pad quick-card">
                  <input type="hidden" name="userId" value={row.id} />
                  {row.open_id ? <input type="hidden" name="plan" value={row.open_plan ?? "quarterly"} /> : null}

                  <div className="row-between">
                    <div>
                      <h2 style={{ marginBottom: 0 }}>{row.name}</h2>
                      <span className="muted small">{row.email}</span>
                    </div>
                    <span className={`badge ${covered ? "badge-paid" : "badge-overdue"}`}>
                      {covered ? `until ${formatDate(row.paid_through)}` : "not covered"}
                    </span>
                  </div>

                  {row.open_id ? (
                    <div className="quick-meta">
                      <StatusBadge status={row.open_status!} />
                      <span className="mono small">{row.open_ref}</span>
                      <span className="small">
                        {formatMoney(row.open_amount ?? 0)} · due {relativeDays(row.open_due ?? day, settings.plan.timezone)}
                      </span>
                    </div>
                  ) : (
                    <p className="muted small" style={{ margin: 0 }}>
                      No open invoice. Saving creates one for the selected term, then marks it paid.
                    </p>
                  )}

                  {row.open_id ? null : (
                    <div className="field">
                      <label className="label" htmlFor={`plan-${row.id}`}>
                        Term
                      </label>
                      <select id={`plan-${row.id}`} name="plan" className="select" defaultValue={defaultPlan}>
                        {PLAN_ORDER.map((plan) => (
                          <option key={plan} value={plan}>
                            {PLANS[plan].label} — {formatMoney(priceFor(plan, termIndex, settings.pricing))}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="form-grid">
                    <div className="field">
                      <label className="label" htmlFor={`method-${row.id}`}>
                        Method
                      </label>
                      <select id={`method-${row.id}`} name="method" className="select" defaultValue="venmo">
                        <option value="venmo">Venmo</option>
                        <option value="zelle">Zelle</option>
                        <option value="wechat">WeChat</option>
                        <option value="alipay">Alipay</option>
                      </select>
                    </div>
                    <div className="field">
                      <label className="label" htmlFor={`currency-${row.id}`}>
                        Currency
                      </label>
                      <select id={`currency-${row.id}`} name="currency" className="select" defaultValue="USD">
                        <option value="USD">USD</option>
                        <option value="CNY">CNY</option>
                      </select>
                    </div>
                    <div className="field full">
                      <label className="label" htmlFor={`amount-${row.id}`}>
                        Amount
                      </label>
                      <input
                        id={`amount-${row.id}`}
                        name="amount"
                        className="input"
                        inputMode="decimal"
                        defaultValue={defaultAmount.toFixed(2)}
                        required
                      />
                    </div>
                    <div className="field full">
                      <label className="label" htmlFor={`proof-${row.id}`}>
                        Proof (optional)
                      </label>
                      <input
                        id={`proof-${row.id}`}
                        name="proof"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="input"
                      />
                      <span className="hint">Screenshot from the payment app; stored with the payment.</span>
                    </div>
                  </div>

                  <SubmitButton className="btn btn-primary btn-block" pending="Recording…">
                    Mark paid
                  </SubmitButton>
                </form>
              );
            })}
          </div>

          <form action={quickUploadQrAction} className="card card-pad stack-sm">
            <div>
              <h2>Payment QR</h2>
              <span className="muted small">Take a photo or pick the QR from the gallery.</span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="quick-wechat">
                  WeChat QR
                </label>
                <input id="quick-wechat" name="wechatQrFile" type="file" accept="image/png,image/jpeg,image/webp" className="input" />
                {settings.payments.wechatQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.payments.wechatQrUrl} alt="Current WeChat QR" className="qr" style={{ maxWidth: 120 }} />
                ) : null}
              </div>
              <div className="field">
                <label className="label" htmlFor="quick-alipay">
                  Alipay QR
                </label>
                <input id="quick-alipay" name="alipayQrFile" type="file" accept="image/png,image/jpeg,image/webp" className="input" />
                {settings.payments.alipayQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={settings.payments.alipayQrUrl} alt="Current Alipay QR" className="qr" style={{ maxWidth: 120 }} />
                ) : null}
              </div>
            </div>
            <SubmitButton className="btn btn-secondary" pending="Uploading…">
              Save QR codes
            </SubmitButton>
          </form>

          <div className="row small">
            <Link href="/admin/invoices">Invoices</Link>
            <Link href="/admin/members">Members</Link>
            <Link href="/admin/settings">Settings</Link>
            <Link href="/admin/pool">Pool</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
