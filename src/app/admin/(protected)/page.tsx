import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addMonths, formatDate, formatDateTime, formatMoney, relativeDays, today } from "@/lib/dates";
import { seatCapacity, seatsUsed } from "@/lib/auth";
import { latestStoredRate } from "@/lib/fx";
import { removalCandidates } from "@/lib/reminders";
import { statusFor, storageTotals } from "@/lib/storage";
import { smtpConfigured } from "@/lib/email";
import { runJobsAction, sendDigestNowAction } from "@/app/actions/admin";
import { Empty, Notice, Stat, StatusBadge, MethodBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ran?: string; digest?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  const day = today(settings.plan.timezone);
  const monthStart = `${day.slice(0, 7)}-01`;

  const totals = db()
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status='paid' THEN amount_usd ELSE 0 END),0) AS collected,
        COALESCE(SUM(CASE WHEN status IN ('awaiting_payment','submitted','overdue') THEN amount_usd ELSE 0 END),0) AS outstanding,
        COALESCE(SUM(CASE WHEN status='overdue' THEN 1 ELSE 0 END),0) AS overdue,
        COALESCE(SUM(CASE WHEN status='paid' AND paid_at >= ? THEN amount_usd ELSE 0 END),0) AS month
       FROM invoices`,
    )
    .get(monthStart) as { collected: number; outstanding: number; overdue: number; month: number };

  const open = db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE i.status IN ('awaiting_payment','submitted','overdue')
       ORDER BY CASE i.status WHEN 'overdue' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END, i.due_date`,
    )
    .all() as unknown as (Invoice & { user_name: string; user_email: string })[];

  const pendingPayments = db()
    .prepare(
      `SELECT p.*, u.name AS user_name, i.reference
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN users u ON u.id = i.user_id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC LIMIT 10`,
    )
    .all() as {
    id: string;
    invoice_id: string;
    method: "wechat" | "alipay" | "venmo" | "zelle";
    amount: number;
    currency: string;
    amount_usd: number;
    created_at: string;
    user_name: string;
    reference: string;
  }[];

  const events = db()
    .prepare("SELECT * FROM events ORDER BY id DESC LIMIT 8")
    .all() as { id: number; at: string; action: string; detail: string | null }[];

  const removals = removalCandidates(day);
  const storage = storageTotals();
  const storageUsers = db()
    .prepare(
      "SELECT id, name, email, storage_used_gb, storage_updated_at FROM users WHERE status = 'active' ORDER BY storage_used_gb DESC",
    )
    .all() as { id: string; name: string; email: string; storage_used_gb: number; storage_updated_at: string | null }[];
  const rate = latestStoredRate();
  const nextDue = open[0]?.due_date;

  return (
    <>
      {params.ran !== undefined ? (
        <Notice tone="ok">
          Daily jobs finished — {params.ran} reminder(s) sent{params.digest === "1" ? ", digest delivered" : ""}.
        </Notice>
      ) : null}
      {params.saved === "digest" ? <Notice tone="ok">Digest sent to your email.</Notice> : null}
      {params.saved === "digest-skipped" ? (
        <Notice tone="warn">Digest skipped — configure SMTP in Settings first.</Notice>
      ) : null}

      <div className="row-between">
        <div>
          <h1>Overview</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {settings.plan.name} · {seatsUsed()} of {seatCapacity()} seats · next due{" "}
            {nextDue ? `${formatDate(nextDue)} (${relativeDays(nextDue, settings.plan.timezone)})` : "nothing open"}
          </p>
        </div>
        <div className="row">
          <form action={sendDigestNowAction}>
            <SubmitButton className="btn btn-secondary" pending="Sending…">
              Send digest now
            </SubmitButton>
          </form>
          <form action={runJobsAction}>
            <SubmitButton className="btn btn-primary" pending="Running…">
              Run daily jobs
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Collected all time" value={formatMoney(totals.collected)} sub={`${formatMoney(totals.month)} this month`} />
        <Stat
          label="Outstanding"
          value={formatMoney(totals.outstanding)}
          sub={`${open.length} open invoice${open.length === 1 ? "" : "s"}`}
          tone={totals.outstanding > 0 ? "warn" : undefined}
        />
        <Stat
          label="Overdue"
          value={String(totals.overdue)}
          sub={`Grace period ${settings.plan.graceDays} days`}
          tone={totals.overdue > 0 ? "bad" : undefined}
        />
        <Stat label="Seats used" value={`${seatsUsed()} / ${seatCapacity()}`} sub={rate ? `USD→CNY ${rate.rate.toFixed(4)} (${rate.date})` : "No FX rate cached"} />
      </div>

      {removals.length > 0 ? (
        <Notice tone="error">
          <strong>{removals.length} seat(s) past the grace period.</strong> Reminders have gone out; remove the member
          from <Link href="/admin/members">Members</Link> if payment does not arrive.{" "}
          {removals.map((row) => `${row.user_name} (${formatDate(row.due_date)})`).join(", ")}.
        </Notice>
      ) : null}

      <div className="card">
        <div className="card-head">
          <h2>Open payments</h2>
          <Link href="/admin/invoices" className="btn btn-ghost btn-sm">
            All invoices →
          </Link>
        </div>
        {open.length === 0 ? (
          <Empty>Everyone is paid up. Nice.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Reference</th>
                  <th>Term</th>
                  <th className="right">Amount</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {open.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <div className="strong">{invoice.user_name}</div>
                      <div className="muted small">{invoice.user_email}</div>
                    </td>
                    <td className="mono small">{invoice.reference}</td>
                    <td className="small">
                      {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                      <div className="muted">term {invoice.term_index}</div>
                    </td>
                    <td className="right">
                      {formatMoney(invoice.amount_usd)}
                      <div className="muted small">¥{invoice.amount_cny.toFixed(2)}</div>
                    </td>
                    <td className="small">
                      {formatDate(invoice.due_date)}
                      <div className="muted">{relativeDays(invoice.due_date, settings.plan.timezone)}</div>
                    </td>
                    <td>
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="right">
                      <Link href={`/dashboard/pay/${invoice.id}`} className="btn btn-secondary btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingPayments.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h2>Payments needing review</h2>
            <span className="badge badge-warn">{pendingPayments.length}</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Reference</th>
                  <th>Method</th>
                  <th className="right">Received</th>
                  <th>When</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pendingPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.user_name}</td>
                    <td className="mono small">{payment.reference}</td>
                    <td>
                      <MethodBadge method={payment.method} />
                    </td>
                    <td className="right">
                      {payment.currency === "CNY" ? `¥${payment.amount.toFixed(2)}` : formatMoney(payment.amount)}
                      <div className="muted small">≈ {formatMoney(payment.amount_usd)}</div>
                    </td>
                    <td className="small">{formatDateTime(payment.created_at, settings.plan.timezone)}</td>
                    <td className="right">
                      <Link href="/admin/invoices" className="btn btn-secondary btn-sm">
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {settings.storage.enabled ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Storage pool</h2>
              <span className="muted small">
                {storage.totalGb} GB shared · {storage.quotaGb.toFixed(0)} GB per seat ({settings.plan.seats}-way split)
              </span>
            </div>
            <span className={`badge ${storage.people > 0 && storage.percent > 100 ? "badge-overdue" : "badge-paid"}`}>
              {storage.usedGb.toFixed(0)} GB reported
            </span>
          </div>
          <div className="card-body">
            <div className="meter">
              <span
                className={storage.percent > 100 ? "bad" : storage.percent >= settings.storage.warnPercent ? "warn" : ""}
                style={{ width: `${Math.min(storage.percent, 100)}%` }}
              />
            </div>
            <div className="row-between small muted" style={{ marginBottom: 8 }}>
              <span>{storage.percent.toFixed(1)}% of the family pool</span>
              <span>{storage.people} active people</span>
            </div>

            {storageUsers.map((member) => {
              const state = statusFor(member, settings);
              return (
                <div className="storage-row" key={member.id}>
                  <div className="small">
                    <strong>{member.name}</strong> <span className="muted">{member.email}</span>
                  </div>
                  <div className="small strong">
                    {state.usedGb.toFixed(1)} / {state.quotaGb.toFixed(0)} GB{" "}
                    {state.over ? <span className="badge badge-overdue">over</span> : null}
                  </div>
                  <div className="meter">
                    <span
                      className={state.over ? "bad" : state.percent >= settings.storage.warnPercent ? "warn" : ""}
                      style={{ width: `${Math.min(state.percent, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="hint" style={{ marginTop: 10, marginBottom: 0 }}>
              Update usage per member under <Link href="/admin/members">Members</Link>, or POST to{" "}
              <span className="mono">/api/storage/update</span>. Apple has no public API for family storage, so values
              are reported rather than scraped.
            </p>
          </div>
        </div>
      ) : null}

      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>Recent activity</h2>
          </div>
          {events.length === 0 ? (
            <Empty>No activity recorded yet.</Empty>
          ) : (
            <div className="card-body stack-sm">
              {events.map((item) => (
                <div key={item.id} className="row-between small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                  <span className="mono">{item.action}</span>
                  <span className="muted">{formatDateTime(item.at, settings.plan.timezone)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head">
            <h2>System</h2>
          </div>
          <div className="card-body stack-sm small">
            <div className="row-between">
              <span>Email</span>
              {smtpConfigured() ? <span className="badge badge-paid">Configured</span> : <span className="badge badge-warn">Not configured</span>}
            </div>
            <div className="row-between">
              <span>Reminders</span>
              {settings.reminders.enabled ? <span className="badge badge-paid">On</span> : <span className="badge badge-void">Off</span>}
            </div>
            <div className="row-between">
              <span>Automatic matching</span>
              {settings.automation.autoVerify ? <span className="badge badge-paid">On</span> : <span className="badge badge-void">Manual</span>}
            </div>
            <div className="row-between">
              <span>IMAP polling</span>
              {settings.automation.imapEnabled ? <span className="badge badge-paid">On</span> : <span className="badge badge-void">Off</span>}
            </div>
            <div className="row-between">
              <span>FX rate</span>
              <span>{rate ? `${rate.rate.toFixed(4)} · ${rate.date}` : "—"}</span>
            </div>
            <hr style={{ margin: "6px 0" }} />
            <Link href="/admin/settings" className="btn btn-secondary btn-sm">
              Open settings
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
