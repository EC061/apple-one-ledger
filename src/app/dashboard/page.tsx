import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, relativeDays, today } from "@/lib/dates";
import { PLANS, PLAN_ORDER, priceFor } from "@/lib/pricing";
import { openInvoiceFor, nextTermIndex } from "@/lib/billing";
import { statusFor } from "@/lib/storage";
import { db } from "@/lib/db";
import { updateProfileAction, createInvoiceAction } from "@/app/actions/member";
import { logoutAllAction } from "@/app/actions/auth";
import TopBar from "@/components/TopBar";
import { Empty, Notice, Stat, StatusBadge, MethodBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import AccessCodeFlash from "@/components/AccessCodeFlash";
import { NextTermNotice } from "@/components/PriceTerms";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  plan: "Pick a valid term.",
  open: "You already have an open invoice. Pay it, or ask the admin to void it.",
  name: "Enter your name (2–60 characters).",
  email: "Enter a valid email address.",
  emailused: "That email is already used by another member.",
  fx: "No USD→CNY rate is available. Ask the admin to set a rate in Settings → Exchange rate.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; submitted?: string; error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin");

  const params = await searchParams;
  const settings = getSettings();
  const day = today(settings.plan.timezone);
  const open = openInvoiceFor(user.id);
  const termIndex = open?.term_index ?? nextTermIndex(user.id);
  const history = db()
    .prepare("SELECT * FROM invoices WHERE user_id = ? AND status <> 'void' ORDER BY created_at DESC LIMIT 12")
    .all(user.id) as unknown as Invoice[];

  const covered = user.paid_through && user.paid_through >= day;
  const storage = statusFor(user, settings);

  return (
    <div className="page">
      <TopBar user={user} area="member" />
      <main className="grow">
        <div className="container stack">
          <AccessCodeFlash />

          {params.joined ? (
            <Notice tone="ok">
              Welcome aboard. Your seat is active — choose a term below when you are ready to pay.
            </Notice>
          ) : null}
          {params.submitted ? (
            <Notice tone="ok">
              Payment reported. The admin will confirm it, and you will get a receipt by email.
            </Notice>
          ) : null}
          {params.saved === "profile" ? <Notice tone="ok">Profile updated.</Notice> : null}
          {params.error ? (
            <Notice tone="error">{ERRORS[params.error] ?? "Something went wrong. Please try again."}</Notice>
          ) : null}

          <div className="row-between">
            <div>
              <h1>Hi, {user.name.split(" ")[0]}</h1>
              <p className="muted" style={{ marginBottom: 0 }}>
                {settings.plan.name} · {settings.plan.seats} seats in total
              </p>
            </div>
            {covered ? (
              <span className="badge badge-paid">Covered until {formatDate(user.paid_through)}</span>
            ) : (
              <span className="badge badge-overdue">No active coverage</span>
            )}
          </div>

          <div className="grid grid-4">
            <Stat
              label="Coverage"
              value={user.paid_through ? formatDate(user.paid_through) : "Not covered"}
              sub={user.paid_through ? relativeDays(user.paid_through, settings.plan.timezone) : "Pick a term to start"}
              tone={covered ? undefined : "warn"}
            />
            <Stat
              label="Open balance"
              value={open ? formatMoney(open.amount_usd) : formatMoney(0)}
              sub={open ? `due ${formatDate(open.due_date)} · ${open.status.replace("_", " ")}` : "Nothing outstanding"}
              tone={open ? "warn" : undefined}
            />
            <Stat
              label="Term"
              value={`Term ${termIndex}`}
              sub={termIndex <= 1 ? "first-term pricing applies" : "renewal pricing applies"}
            />
            <Stat
              label="Storage"
              value={storage.reported ? `${storage.usedGb.toFixed(0)} GB` : "Not reported"}
              sub={
                storage.reported
                  ? `of ${storage.quotaGb.toFixed(0)} GB share (${storage.percent.toFixed(0)}%)`
                  : "Waiting for the admin to report usage"
              }
              tone={storage.over ? "bad" : storage.percent >= settings.storage.warnPercent ? "warn" : undefined}
            />
          </div>

          {settings.storage.enabled ? (
            <div className="card card-pad">
              <div className="row-between">
                <div>
                  <h3>Your storage share</h3>
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    {settings.storage.totalGb} GB family pool split {settings.storage.shareCount} ways ={" "}
                    {storage.quotaGb.toFixed(0)} GB each · fair-share guideline, not a hard cap
                  </p>
                </div>
                <span className={`badge ${storage.over ? "badge-overdue" : storage.percent >= settings.storage.warnPercent ? "badge-warn" : "badge-paid"}`}>
                  {storage.reported ? `${storage.percent.toFixed(0)}% used` : "no data"}
                </span>
              </div>
              <div className="meter" aria-hidden="true">
                <span
                  className={storage.over ? "bad" : storage.percent >= settings.storage.warnPercent ? "warn" : ""}
                  style={{ width: `${Math.min(storage.percent, 100)}%` }}
                />
              </div>
              <div className="row-between small muted">
                <span>
                  {storage.reported ? `${storage.usedGb.toFixed(1)} GB of ${storage.quotaGb.toFixed(1)} GB` : "No reading yet"}
                </span>
                <span>
                  {storage.over
                    ? "Over your fair share — please free up space."
                    : storage.updatedAt
                      ? `Updated ${formatDateTime(storage.updatedAt, settings.plan.timezone)}${storage.stale ? " · outdated" : ""}`
                      : "Not reported yet"}
                </span>
              </div>
            </div>
          ) : null}

          {open ? (
            <div className="card">
              <div className="card-head">
                <div>
                  <h2>Open invoice</h2>
                  <span className="muted small mono">{open.reference}</span>
                </div>
                <StatusBadge status={open.status} />
              </div>
              <div className="card-body stack">
                <dl className="dt">
                  <dt>Amount</dt>
                  <dd>
                    {formatMoney(open.amount_usd)}{" "}
                    <span className="muted">
                      · ¥{open.amount_cny.toFixed(2)} @ {open.fx_rate.toFixed(4)}
                    </span>
                  </dd>
                  <dt>Term</dt>
                  <dd>
                    {formatDate(open.period_start)} – {formatDate(open.period_end)}
                  </dd>
                  <dt>Due</dt>
                  <dd>
                    {formatDate(open.due_date)} <span className="muted">({relativeDays(open.due_date, settings.plan.timezone)})</span>
                  </dd>
                  <dt>Pricing</dt>
                  <dd>{open.term_index <= 1 ? "First term (introductory)" : `Renewal (term ${open.term_index})`}</dd>
                </dl>
                <div className="row">
                  <Link href={`/dashboard/pay/${open.id}`} className="btn btn-primary">
                    {open.status === "submitted" ? "View payment status" : `Pay ${formatMoney(open.amount_usd)}`}
                  </Link>
                  <span className="muted small">
                    Reference <span className="mono">{open.reference}</span>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="stack">
              <NextTermNotice pricing={settings.pricing} termIndex={termIndex} />
              <div>
                <h2>Choose a term</h2>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  This creates an invoice you can pay now; coverage starts the day after your current term ends.
                </p>
              </div>
              <div className="price-grid">
                {PLAN_ORDER.map((key) => {
                  const plan = PLANS[key];
                  const price = priceFor(key, termIndex, settings.pricing);
                  return (
                    <form action={createInvoiceAction} key={key}>
                      <input type="hidden" name="plan" value={key} />
                      <div className="price-card" style={{ height: "100%" }}>
                        <div className="price-name">{plan.label}</div>
                        <div className="price-amount">
                          {formatMoney(price)} <span>{plan.months} months</span>
                        </div>
                        <div className="price-note">
                          {termIndex <= 1 ? "First-term price" : "Renewal price"} ·{" "}
                          {formatMoney(price / plan.months)}/month
                        </div>
                        <div className="price-renew">
                          Renews at {formatMoney(priceFor(key, termIndex + 1, settings.pricing))}
                        </div>
                        <div className="spacer" style={{ minHeight: 10 }} />
                        <SubmitButton className="btn btn-primary btn-block" pending="Creating invoice…">
                          Choose {plan.label.toLowerCase()} · {formatMoney(price)}
                        </SubmitButton>
                      </div>
                    </form>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Payment history</h2>
            </div>
            {history.length === 0 ? (
              <Empty>No invoices yet. Pick a term above to get started.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Term</th>
                      <th>Amount</th>
                      <th>Method</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="mono small">
                          <Link href={`/dashboard/pay/${invoice.id}`}>{invoice.reference}</Link>
                        </td>
                        <td>
                          <div>{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</div>
                          <div className="muted small">
                            {PLANS[invoice.plan].label} · term {invoice.term_index}
                          </div>
                        </td>
                        <td>
                          {formatMoney(invoice.amount_usd)}
                          <div className="muted small">¥{invoice.amount_cny.toFixed(2)}</div>
                        </td>
                        <td>
                          <MethodBadge method={invoice.method} />
                        </td>
                        <td>
                          <StatusBadge status={invoice.status} />
                          {invoice.paid_at ? (
                            <div className="muted small">{formatDate(invoice.paid_at.slice(0, 10))}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="split">
            <div className="card">
              <div className="card-head">
                <h2>Your details</h2>
              </div>
              <div className="card-body">
                <form action={updateProfileAction} className="stack-sm">
                  <div className="form-grid">
                    <div className="field">
                      <label className="label" htmlFor="name">
                        Name
                      </label>
                      <input id="name" name="name" className="input" defaultValue={user.name} required />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="email">
                        Email
                      </label>
                      <input id="email" name="email" type="email" className="input" defaultValue={user.email} required />
                    </div>
                  </div>
                  <div className="row">
                    <SubmitButton className="btn btn-secondary" pending="Saving…">
                      Save details
                    </SubmitButton>
                    <span className="hint">Reminders and receipts are sent to this address.</span>
                  </div>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Access</h2>
              </div>
              <div className="card-body stack-sm">
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Signed in as <strong>{user.email}</strong>. If your code leaked, sign out everywhere and ask the
                  admin to issue a new one.
                </p>
                <form action={logoutAllAction}>
                  <SubmitButton className="btn btn-danger btn-sm" pending="Signing out…">
                    Sign out of all devices
                  </SubmitButton>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
      <footer className="footer">
        <div className="container row-between">
          <span>{settings.plan.name}</span>
          <span className="muted">Payments in USD or CNY · WeChat · Alipay · Venmo · Zelle</span>
        </div>
      </footer>
    </div>
  );
}
