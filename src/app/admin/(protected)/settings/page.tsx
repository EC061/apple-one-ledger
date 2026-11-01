import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney, today } from "@/lib/dates";
import { perSeatMonthly } from "@/lib/pricing";
import { latestStoredRate } from "@/lib/fx";
import { smtpConfigured } from "@/lib/email";
import { getBaseUrl } from "@/lib/url";
import { db } from "@/lib/db";
import { saveSettingsAction, testSmtpAction, refreshFxAction } from "@/app/actions/admin";
import { updateProfileAction } from "@/app/actions/member";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { EmailRow } from "@/lib/email-types";

export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = {
  plan: "Plan and pricing saved.",
  payments: "Payment details saved.",
  smtp: "SMTP settings saved.",
  fx: "Exchange-rate settings saved.",
  reminders: "Reminder settings saved.",
  automation: "Automation settings saved.",
  storage: "Storage settings saved.",
  profile: "Profile updated.",
  "smtp-test": "Test email sent — check the inbox.",
  "fx-refresh": "Exchange rate refreshed.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const admin = await requireAdmin();
  const settings = getSettings();
  const { plan, pricing, payments, smtp, fx, reminders, automation, imap, storage } = settings;
  const rate = latestStoredRate();
  const baseUrl = await getBaseUrl();
  const seatCost = perSeatMonthly(pricing, plan.seats);

  const emailLog = db()
    .prepare("SELECT id, to_addr, subject, kind, status, error, created_at FROM emails ORDER BY created_at DESC LIMIT 12")
    .all() as unknown as EmailRow[];

  return (
    <>
      {params.saved ? <Notice tone="ok">{(params.saved && SAVED[params.saved]) ?? "Saved."}</Notice> : null}
      {params.error ? (
        <Notice tone="error">That change could not be saved. Check the server log for the exact error.</Notice>
      ) : null}

      <div className="row-between">
        <div>
          <h1>Settings</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Everything is stored in SQLite except secrets in the environment.
          </p>
        </div>
        <div className="row small muted">
          <Link href="#pricing">Pricing</Link>·<Link href="#payments">Payments</Link>·<Link href="#email">Email</Link>·
          <Link href="#fx">FX</Link>·<Link href="#reminders">Reminders</Link>·<Link href="#storage">Storage</Link>·
          <Link href="#automation">Automation</Link>·<Link href="#profile">Profile</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">Per seat / month</div>
          <div className="stat-value">{formatMoney(seatCost)}</div>
          <div className="stat-sub">{formatMoney(pricing.monthlyTotalUsd)} ÷ {plan.seats}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Seats</div>
          <div className="stat-value">{plan.seats}</div>
          <div className="stat-sub">admin + {plan.seats - 1} members</div>
        </div>
        <div className="stat">
          <div className="stat-label">USD → CNY</div>
          <div className="stat-value">{rate ? rate.rate.toFixed(4) : "—"}</div>
          <div className="stat-sub">{fx.provider === "manual" ? "manual override" : rate ? `as of ${rate.date}` : "not fetched"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Email</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {smtpConfigured() ? "Configured" : "Not configured"}
          </div>
          <div className="stat-sub">{today(plan.timezone)}</div>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="pricing">
        <div className="card-head">
          <div>
            <h2>Plan &amp; pricing</h2>
            <span className="muted small">First-term prices are charged once per member; renewals apply from term two.</span>
          </div>
        </div>
        <div className="card-body">
          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="plan" />
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="plan-name">
                  Plan name
                </label>
                <input id="plan-name" name="name" className="input" defaultValue={plan.name} />
              </div>
              <div className="field">
                <label className="label" htmlFor="timezone">
                  Timezone (IANA)
                </label>
                <input id="timezone" name="timezone" className="input" defaultValue={plan.timezone} placeholder="UTC" />
              </div>
              <div className="field">
                <label className="label" htmlFor="seats">
                  Total seats
                </label>
                <input id="seats" name="seats" type="number" min={2} max={12} className="input" defaultValue={plan.seats} />
                <span className="hint">Includes the admin. Five other people = 6 seats.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="graceDays">
                  Grace period (days)
                </label>
                <input id="graceDays" name="graceDays" type="number" min={0} max={90} className="input" defaultValue={plan.graceDays} />
              </div>
              <div className="field">
                <label className="label" htmlFor="dueSoonDays">
                  &quot;Due soon&quot; window (days)
                </label>
                <input id="dueSoonDays" name="dueSoonDays" type="number" min={1} max={60} className="input" defaultValue={plan.dueSoonDays} />
              </div>
              <div className="field">
                <label className="label" htmlFor="monthlyTotalUsd">
                  Monthly cost of the whole plan (USD)
                </label>
                <input
                  id="monthlyTotalUsd"
                  name="monthlyTotalUsd"
                  className="input"
                  inputMode="decimal"
                  defaultValue={pricing.monthlyTotalUsd}
                />
                <span className="hint">Cost basis: {formatMoney(pricing.monthlyTotalUsd)} ÷ {plan.seats} = {formatMoney(seatCost)} per seat.</span>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="first_quarterly">
                  First term — quarterly (USD)
                </label>
                <input id="first_quarterly" name="first_quarterly" className="input" defaultValue={pricing.firstTerm.quarterly} />
              </div>
              <div className="field">
                <label className="label" htmlFor="renew_quarterly">
                  Renewal — quarterly (USD)
                </label>
                <input id="renew_quarterly" name="renew_quarterly" className="input" defaultValue={pricing.renewal.quarterly} />
              </div>
              <div className="field">
                <label className="label" htmlFor="first_semiannual">
                  First term — half-year (USD)
                </label>
                <input id="first_semiannual" name="first_semiannual" className="input" defaultValue={pricing.firstTerm.semiannual} />
              </div>
              <div className="field">
                <label className="label" htmlFor="renew_semiannual">
                  Renewal — half-year (USD)
                </label>
                <input id="renew_semiannual" name="renew_semiannual" className="input" defaultValue={pricing.renewal.semiannual} />
              </div>
              <div className="field">
                <label className="label" htmlFor="first_annual">
                  First term — annual (USD)
                </label>
                <input id="first_annual" name="first_annual" className="input" defaultValue={pricing.firstTerm.annual} />
              </div>
              <div className="field">
                <label className="label" htmlFor="renew_annual">
                  Renewal — annual (USD)
                </label>
                <input id="renew_annual" name="renew_annual" className="input" defaultValue={pricing.renewal.annual} />
              </div>
            </div>

            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save plan &amp; pricing
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="payments">
        <div className="card-head">
          <h2>Payment details</h2>
        </div>
        <div className="card-body">
          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="payments" />
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="venmoHandle">
                  Venmo handle
                </label>
                <input id="venmoHandle" name="venmoHandle" className="input" defaultValue={payments.venmoHandle} placeholder="your-handle" />
              </div>
              <div className="field">
                <label className="label" htmlFor="zelleEmail">
                  Zelle email / phone
                </label>
                <input id="zelleEmail" name="zelleEmail" className="input" defaultValue={payments.zelleEmail} />
              </div>
              <div className="field">
                <label className="label" htmlFor="wechatId">
                  WeChat ID
                </label>
                <input id="wechatId" name="wechatId" className="input" defaultValue={payments.wechatId} />
              </div>
              <div className="field">
                <label className="label" htmlFor="alipayId">
                  Alipay ID
                </label>
                <input id="alipayId" name="alipayId" className="input" defaultValue={payments.alipayId} />
              </div>
              <div className="field">
                <label className="label" htmlFor="wechatQrUrl">
                  WeChat QR image URL
                </label>
                <input id="wechatQrUrl" name="wechatQrUrl" className="input" defaultValue={payments.wechatQrUrl} placeholder="https://…" />
              </div>
              <div className="field">
                <label className="label" htmlFor="alipayQrUrl">
                  Alipay QR image URL
                </label>
                <input id="alipayQrUrl" name="alipayQrUrl" className="input" defaultValue={payments.alipayQrUrl} placeholder="https://…" />
              </div>
              <div className="field full">
                <label className="label" htmlFor="instructions">
                  Extra instructions shown on the payment page
                </label>
                <textarea id="instructions" name="instructions" className="textarea" defaultValue={payments.instructions} />
              </div>
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save payment details
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="email">
        <div className="card-head">
          <div>
            <h2>Email (SMTP)</h2>
            <span className="muted small">Reminders, receipts, invitations and the daily digest.</span>
          </div>
          {smtpConfigured() ? <span className="badge badge-paid">Configured</span> : <span className="badge badge-warn">Not configured</span>}
        </div>
        <div className="card-body stack">
          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="smtp" />
            <div className="form-grid">
              <div className="field full">
                <label className="check">
                  <input type="checkbox" name="enabled" defaultChecked={smtp.enabled} />
                  <span>Enable outgoing email</span>
                </label>
              </div>
              <div className="field">
                <label className="label" htmlFor="smtp-host">
                  SMTP host
                </label>
                <input id="smtp-host" name="host" className="input" defaultValue={smtp.host} placeholder="smtp.example.com" />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtp-port">
                  Port
                </label>
                <input id="smtp-port" name="port" type="number" className="input" defaultValue={smtp.port} />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtp-user">
                  Username
                </label>
                <input id="smtp-user" name="user" className="input" defaultValue={smtp.user} autoComplete="off" />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtp-pass">
                  Password
                </label>
                <input
                  id="smtp-pass"
                  name="pass"
                  type="password"
                  className="input"
                  placeholder={smtp.pass ? "unchanged" : ""}
                  autoComplete="new-password"
                />
                <span className="hint">Leave blank to keep the stored password.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="smtp-from">
                  From address
                </label>
                <input id="smtp-from" name="from" className="input" defaultValue={smtp.from} placeholder="Family Plan <plan@example.com>" />
              </div>
              <div className="field">
                <label className="check" style={{ marginTop: 22 }}>
                  <input type="checkbox" name="secure" defaultChecked={smtp.secure} />
                  <span>Implicit TLS (port 465)</span>
                </label>
              </div>
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save SMTP
              </SubmitButton>
            </div>
          </form>

          <hr />
          <form action={testSmtpAction} className="row" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 220 }}>
              <label className="label" htmlFor="test-to">
                Send a test email to
              </label>
              <input id="test-to" name="to" type="email" className="input" defaultValue={admin.email} />
            </div>
            <SubmitButton className="btn btn-secondary" pending="Sending…">
              Test SMTP
            </SubmitButton>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="fx">
        <div className="card-head">
          <div>
            <h2>Exchange rate</h2>
            <span className="muted small">CNY invoices lock the USD→CNY rate at issue time.</span>
          </div>
        </div>
        <div className="card-body stack">
          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="fx" />
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="provider">
                  Source
                </label>
                <select id="provider" name="provider" className="select" defaultValue={fx.provider}>
                  <option value="frankfurter">Automatic daily rate (frankfurter.app / ECB)</option>
                  <option value="manual">Manual rate only</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="manualRate">
                  Manual rate (CNY per 1 USD)
                </label>
                <input id="manualRate" name="manualRate" className="input" inputMode="decimal" defaultValue={fx.manualRate ?? ""} placeholder="7.20" />
                <span className="hint">Used only when source is “manual”.</span>
              </div>
            </div>
            <div className="row">
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save rate settings
              </SubmitButton>
            </div>
          </form>
          <form action={refreshFxAction} className="row">
            <SubmitButton className="btn btn-secondary" pending="Fetching…">
              Refresh rate now
            </SubmitButton>
            <span className="muted small">
              {rate ? `Latest: 1 USD = ${rate.rate.toFixed(4)} CNY (${rate.date}, ${rate.source})` : "No rate cached yet."}
            </span>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="reminders">
        <div className="card-head">
          <h2>Reminders</h2>
        </div>
        <div className="card-body">
          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="reminders" />
            <div className="form-grid">
              <div className="field full">
                <label className="check">
                  <input type="checkbox" name="enabled" defaultChecked={reminders.enabled} />
                  <span>Send payment reminders automatically</span>
                </label>
              </div>
              <div className="field">
                <label className="label" htmlFor="daysBefore">
                  Days before due date
                </label>
                <input id="daysBefore" name="daysBefore" className="input" defaultValue={reminders.daysBefore.join(", ")} />
                <span className="hint">Comma separated, e.g. 7, 3, 1.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="overdueEveryDays">
                  Overdue reminder frequency (days)
                </label>
                <input id="overdueEveryDays" name="overdueEveryDays" type="number" min={1} max={30} className="input" defaultValue={reminders.overdueEveryDays} />
              </div>
              <div className="field">
                <label className="label" htmlFor="removalWarningDays">
                  Removal warning frequency (days)
                </label>
                <input id="removalWarningDays" name="removalWarningDays" type="number" min={1} max={60} className="input" defaultValue={reminders.removalWarningDays} />
              </div>
              <div className="field" style={{ justifyContent: "flex-end" }}>
                <label className="check">
                  <input type="checkbox" name="adminDigest" defaultChecked={reminders.adminDigest} />
                  <span>Send me a daily admin digest</span>
                </label>
              </div>
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save reminders
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="storage">
        <div className="card-head">
          <div>
            <h2>Storage tracking</h2>
            <span className="muted small">
              {storage.totalGb} GB family pool ÷ {plan.seats} seats = {(storage.totalGb / plan.seats).toFixed(1)} GB per person
            </span>
          </div>
          {storage.enabled ? <span className="badge badge-paid">On</span> : <span className="badge badge-void">Off</span>}
        </div>
        <div className="card-body stack">
          <div className="notice">
            <strong>How usage gets in.</strong> Apple does not publish an API for family member iCloud storage. The
            organizer sees it in Settings → Family → iCloud+ (and on iCloud.com), but there is nothing to poll. So usage
            is <em>reported</em>: enter it per member under{" "}
            <Link href="/admin/members">Members</Link>, or POST {"{ email, usedGb }"} to{" "}
            <span className="mono">{baseUrl}/api/storage/update</span> with your{" "}
            <span className="mono">INGEST_TOKEN</span>. When someone exceeds their share, both they and you get an
            email.
          </div>

          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="storage" />
            <div className="form-grid">
              <div className="field full">
                <label className="check">
                  <input type="checkbox" name="enabled" defaultChecked={storage.enabled} />
                  <span>Track per-member storage and send over-quota alerts</span>
                </label>
              </div>
              <div className="field">
                <label className="label" htmlFor="totalGb">
                  Total family pool (GB)
                </label>
                <input id="totalGb" name="totalGb" type="number" min={1} className="input" defaultValue={storage.totalGb} />
                <span className="hint">Apple advertises 2 TB. Use 2000 or 2048 depending on how you count it.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="shareCount">
                  People sharing the pool
                </label>
                <input
                  id="shareCount"
                  name="shareCount"
                  type="number"
                  min={1}
                  max={12}
                  className="input"
                  defaultValue={storage.shareCount}
                />
                <span className="hint">Usually 6. A billing-only admin who is not in the Apple family should not count.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="maxAgeDays">
                  Treat readings older than (days) as stale
                </label>
                <input
                  id="maxAgeDays"
                  name="maxAgeDays"
                  type="number"
                  min={7}
                  max={365}
                  className="input"
                  defaultValue={storage.maxAgeDays}
                />
                <span className="hint">Stale values are shown as outdated and never trigger email.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="warnPercent">
                  Warn at % of share
                </label>
                <input
                  id="warnPercent"
                  name="warnPercent"
                  type="number"
                  min={50}
                  max={100}
                  className="input"
                  defaultValue={storage.warnPercent}
                />
                <span className="hint">Visual warning only; the email fires when someone is over 100% of the fair share.</span>
              </div>
              <div className="field">
                <label className="check">
                  <input type="checkbox" name="notifyMember" defaultChecked={storage.notifyMember} />
                  <span>Email the member when they are over</span>
                </label>
              </div>
              <div className="field">
                <label className="check">
                  <input type="checkbox" name="notifyAdmin" defaultChecked={storage.notifyAdmin} />
                  <span>Email me a daily summary</span>
                </label>
              </div>
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save storage settings
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="automation">
        <div className="card-head">
          <div>
            <h2>Automatic payment matching</h2>
            <span className="muted small">Match incoming payments by the reference code on the invoice.</span>
          </div>
        </div>
        <div className="card-body stack">
          <div className="notice">
            <strong>How it works.</strong> Each invoice has a reference like <span className="mono">A1-7F3K2QW</span>.
            Your payment provider or bank notification (or a forwarding rule) POSTs the reference, amount and method to
            the ingest endpoint. Matching payments are marked paid automatically; mismatches are queued for review.
            There is no public API for personal WeChat / Alipay / Venmo / Zelle accounts, so this endpoint is the
            supported integration point.
          </div>

          <div className="notice small">
            <div>
              <strong>Ingest endpoint:</strong> <span className="mono">POST {baseUrl}/api/payments/ingest</span>
            </div>
            <div>
              <strong>Ingest token:</strong>{" "}
              {process.env.INGEST_TOKEN ? <span className="badge badge-paid">configured</span> : <span className="badge badge-warn">INGEST_TOKEN not set</span>}
            </div>
            <div>
              <strong>Daily cron:</strong> <span className="mono">POST {baseUrl}/api/cron/daily</span>{" "}
              {process.env.CRON_SECRET ? <span className="badge badge-paid">CRON_SECRET configured</span> : <span className="badge badge-warn">CRON_SECRET not set</span>}
            </div>
          </div>

          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="automation" />
            <div className="form-grid">
              <div className="field full">
                <label className="check">
                  <input type="checkbox" name="ingestEnabled" defaultChecked={automation.ingestEnabled} />
                  <span>Accept payments from the ingest endpoint</span>
                </label>
              </div>
              <div className="field full">
                <label className="check">
                  <input type="checkbox" name="autoVerify" defaultChecked={automation.autoVerify} />
                  <span>Mark invoices paid automatically when reference and amount match</span>
                </label>
              </div>
              <div className="field">
                <label className="label" htmlFor="toleranceUsd">
                  Amount tolerance (USD)
                </label>
                <input id="toleranceUsd" name="toleranceUsd" className="input" inputMode="decimal" defaultValue={automation.toleranceUsd} />
                <span className="hint">Covers transfer fees and rounding.</span>
              </div>
              <div className="field" style={{ justifyContent: "flex-end" }}>
                <label className="check">
                  <input type="checkbox" name="imapEnabled" defaultChecked={automation.imapEnabled} />
                  <span>Poll an IMAP inbox for payment notifications</span>
                </label>
              </div>
              <div className="field full">
                <span className="section-title" style={{ margin: "4px 0 0" }}>
                  IMAP (optional)
                </span>
                <span className="hint">
                  Best-effort: reads unread mail, looks for a reference and an amount, then marks the message read.
                </span>
              </div>
              <div className="field">
                <label className="label" htmlFor="imapHost">
                  IMAP host
                </label>
                <input id="imapHost" name="imapHost" className="input" defaultValue={imap.host} placeholder="imap.example.com" />
              </div>
              <div className="field">
                <label className="label" htmlFor="imapPort">
                  Port
                </label>
                <input id="imapPort" name="imapPort" type="number" className="input" defaultValue={imap.port} />
              </div>
              <div className="field">
                <label className="label" htmlFor="imapUser">
                  Username
                </label>
                <input id="imapUser" name="imapUser" className="input" defaultValue={imap.user} autoComplete="off" />
              </div>
              <div className="field">
                <label className="label" htmlFor="imapPass">
                  Password
                </label>
                <input
                  id="imapPass"
                  name="imapPass"
                  type="password"
                  className="input"
                  placeholder={imap.pass ? "unchanged" : ""}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="imapMailbox">
                  Mailbox
                </label>
                <input id="imapMailbox" name="imapMailbox" className="input" defaultValue={imap.mailbox} />
              </div>
              <div className="field full">
                <label className="label" htmlFor="imapAllowedSenders">
                  Only accept mail from (comma separated)
                </label>
                <input
                  id="imapAllowedSenders"
                  name="imapAllowedSenders"
                  className="input"
                  defaultValue={imap.allowedSenders}
                  placeholder="alerts@bank.com, no-reply@venmo.com"
                />
                <span className="hint">
                  Required. Polling stays off while this is empty, so a random unread email can never settle an invoice.
                </span>
              </div>
              <div className="field" style={{ justifyContent: "flex-end" }}>
                <label className="check">
                  <input type="checkbox" name="imapSecure" defaultChecked={imap.secure} />
                  <span>Implicit TLS</span>
                </label>
              </div>
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save automation
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card" id="profile">
        <div className="card-head">
          <h2>Your admin profile</h2>
        </div>
        <div className="card-body">
          <form action={updateProfileAction} className="form-grid">
            <div className="field">
              <label className="label" htmlFor="admin-name">
                Name
              </label>
              <input id="admin-name" name="name" className="input" defaultValue={admin.name} required />
            </div>
            <div className="field">
              <label className="label" htmlFor="admin-email">
                Email
              </label>
              <input id="admin-email" name="email" type="email" className="input" defaultValue={admin.email} required />
            </div>
            <div className="full">
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save profile
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>

      {/* ---------------------------------------------------------- */}
      <div className="card">
        <div className="card-head">
          <h2>Recent email</h2>
          <span className="muted small">Last 12 messages</span>
        </div>
        {emailLog.length === 0 ? (
          <div className="empty">No email has been sent yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {emailLog.map((row) => (
                  <tr key={row.id}>
                    <td className="small">{row.to_addr}</td>
                    <td className="small">{row.subject}</td>
                    <td className="small">{row.kind}</td>
                    <td>
                      <span className={`badge ${row.status === "sent" ? "badge-paid" : row.status === "failed" ? "badge-overdue" : "badge-void"}`}>
                        {row.status}
                      </span>
                      {row.error ? <div className="muted small">{row.error}</div> : null}
                    </td>
                    <td className="small">{formatDateTime(row.created_at, plan.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
