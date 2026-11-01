import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatDateTime, formatMoney } from "@/lib/dates";
import { perSeatMonthly } from "@/lib/pricing";
import { latestStoredRate } from "@/lib/fx";
import { smtpConfigured } from "@/lib/email";
import { db } from "@/lib/db";
import { saveSettingsAction, testSmtpAction, refreshFxAction } from "@/app/actions/admin";
import { updateProfileAction } from "@/app/actions/member";
import SubmitButton from "@/components/SubmitButton";
import TableHead from "@/components/TableHead";
import type { EmailRow } from "@/lib/email-types";

export async function PlanPricingCard() {
  const settings = getSettings();
  const { plan, pricing } = settings;
  const seatCost = perSeatMonthly(pricing, plan.seats);
  return (
    <>
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
              <div className="field full">
                <label className="label" htmlFor="services">
                  What the plan includes (one per line)
                </label>
                <textarea
                  id="services"
                  name="services"
                  className="textarea"
                  defaultValue={plan.services.join("\n")}
                />
                <span className="hint">Shown on the public page as the shared services.</span>
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
                  Invoice due window (days after issue)
                </label>
                <input id="dueSoonDays" name="dueSoonDays" type="number" min={1} max={60} className="input" defaultValue={plan.dueSoonDays} />
                <span className="hint">Due date only. Email timing is configured under Reminders.</span>
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
    </>
  );
}

export async function PaymentDetailsCard() {
  const { payments } = getSettings();
  return (
    <>
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
                <label className="label" htmlFor="wechatQrFile">
                  Upload WeChat QR (camera or photo)
                </label>
                <input
                  id="wechatQrFile"
                  name="wechatQrFile"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="input"
                />
                <span className="hint">PNG/JPG/WebP, up to 5 MB. Replaces the URL below.</span>
                {payments.wechatQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={payments.wechatQrUrl} alt="Current WeChat QR" className="qr" style={{ maxWidth: 120 }} />
                ) : null}
              </div>
              <div className="field">
                <label className="label" htmlFor="alipayQrFile">
                  Upload Alipay QR (camera or photo)
                </label>
                <input
                  id="alipayQrFile"
                  name="alipayQrFile"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="input"
                />
                <span className="hint">PNG/JPG/WebP, up to 5 MB. Replaces the URL below.</span>
                {payments.alipayQrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={payments.alipayQrUrl} alt="Current Alipay QR" className="qr" style={{ maxWidth: 120 }} />
                ) : null}
              </div>
              <div className="field">
                <label className="label" htmlFor="wechatQrUrl">
                  WeChat QR image URL (optional)
                </label>
                <input id="wechatQrUrl" name="wechatQrUrl" className="input" defaultValue={payments.wechatQrUrl} placeholder="https://…" />
              </div>
              <div className="field">
                <label className="label" htmlFor="alipayQrUrl">
                  Alipay QR image URL (optional)
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
    </>
  );
}

export async function SmtpCard() {
  const { smtp } = getSettings();
  const admin = await requireAdmin();
  return (
    <>
      <div className="card" id="email">
        <div className="card-head">
          <div>
            <h2>Email (SMTP)</h2>
            <span className="muted small">Reminders, receipts and invitations.</span>
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
                <label className="label" htmlFor="smtp-from-name">
                  From name
                </label>
                <input
                  id="smtp-from-name"
                  name="fromName"
                  className="input"
                  defaultValue={smtp.fromName}
                  placeholder="Family Plan"
                />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtp-from-email">
                  From email
                </label>
                <input
                  id="smtp-from-email"
                  name="fromEmail"
                  type="email"
                  className="input"
                  defaultValue={smtp.fromEmail}
                  placeholder="plan@example.com"
                />
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
    </>
  );
}

export async function FxCard() {
  const { fx } = getSettings();
  const rate = latestStoredRate();
  return (
    <>
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
    </>
  );
}

export async function RemindersCard() {
  const { reminders } = getSettings();
  return (
    <>
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
                  <span>Send these two reminder emails</span>
                </label>
              </div>
              <div className="field">
                <label className="label" htmlFor="advanceDays">
                  Advance notice (days before due or expiry)
                </label>
                <input
                  id="advanceDays"
                  name="advanceDays"
                  type="number"
                  min={1}
                  max={60}
                  className="input"
                  defaultValue={reminders.advanceDays}
                />
                <span className="hint">One email to the member; one summary to you.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="lateDays">
                  Late notice (days after due)
                </label>
                <input
                  id="lateDays"
                  name="lateDays"
                  type="number"
                  min={1}
                  max={60}
                  className="input"
                  defaultValue={reminders.lateDays}
                />
                <span className="hint">One email to you per invoice, to remove or contact the member.</span>
              </div>
            </div>
            <div className="notice small">
              That is the whole schedule: one advance notice to both sides, then one late notice to you. Nothing
              else is sent automatically.
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save reminders
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export async function AdminProfileCard() {
  const admin = await requireAdmin();
  return (
    <>
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
    </>
  );
}

export async function EmailLogCard() {
  const { plan } = getSettings();
  const emailLog = db()
    .prepare("SELECT id, to_addr, subject, kind, status, error, created_at FROM emails ORDER BY created_at DESC LIMIT 12")
    .all() as unknown as EmailRow[];

  return (
    <>
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
              <TableHead
                columns={[
                  { label: "To" },
                  { label: "Subject" },
                  { label: "Kind" },
                  { label: "Status" },
                  { label: "When" },
                ]}
              />
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

export async function AppCard() {
  const { app } = getSettings();
  return (
    <>
      <div className="card" id="app">
        <div className="card-head">
          <div>
            <h2>Application behaviour</h2>
            <span className="muted small">Hard limits that used to be baked into the code.</span>
          </div>
        </div>
        <div className="card-body">
          <form action={saveSettingsAction} className="stack">
            <input type="hidden" name="intent" value="app" />
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="sessionDays">
                  Session lifetime (days)
                </label>
                <input
                  id="sessionDays"
                  name="sessionDays"
                  type="number"
                  min={1}
                  max={365}
                  className="input"
                  defaultValue={app.sessionDays}
                />
                <span className="hint">How long a member stays signed in before the code is required again.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="schedulerHours">
                  Scheduler interval (hours)
                </label>
                <input
                  id="schedulerHours"
                  name="schedulerHours"
                  type="number"
                  min={1}
                  max={168}
                  className="input"
                  defaultValue={app.schedulerHours}
                />
                <span className="hint">Takes effect on the next container restart.</span>
              </div>
              <div className="field">
                <label className="label" htmlFor="paymentToleranceUsd">
                  Payment tolerance (USD)
                </label>
                <input
                  id="paymentToleranceUsd"
                  name="paymentToleranceUsd"
                  className="input"
                  inputMode="decimal"
                  defaultValue={app.paymentToleranceUsd}
                />
                <span className="hint">A payment within this amount of the invoice is treated as paid in full.</span>
              </div>
            </div>
            <div>
              <SubmitButton className="btn btn-primary" pending="Saving…">
                Save application settings
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
