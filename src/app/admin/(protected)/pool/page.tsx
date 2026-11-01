import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, relativeDays, today } from "@/lib/dates";
import { seatCapacity, seatsUsed } from "@/lib/auth";
import { statusFor, storageTotals } from "@/lib/storage";
import { Empty, Stat, StatusBadge } from "@/components/ui";
import TableHead from "@/components/TableHead";
import type { InvoiceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PoolRow {
  id: string;
  name: string;
  email: string;
  paid_through: string | null;
  storage_used_gb: number;
  storage_updated_at: string | null;
  open_id: string | null;
  open_amount: number | null;
  open_status: InvoiceStatus | null;
  open_due: string | null;
}

export default async function PoolPage() {
  const settings = getSettings();
  const day = today(settings.plan.timezone);

  const rows = db()
    .prepare(
      `SELECT u.id, u.name, u.email, u.paid_through, u.storage_used_gb, u.storage_updated_at,
              i.id AS open_id, i.amount_usd AS open_amount, i.status AS open_status, i.due_date AS open_due
       FROM users u
       LEFT JOIN invoices i ON i.user_id = u.id AND i.status IN ('awaiting_payment','submitted','overdue')
       WHERE u.status = 'active'
       ORDER BY (u.paid_through IS NULL OR u.paid_through < ?), u.paid_through, u.name`,
    )
    .all(day) as unknown as PoolRow[];

  const removed = db()
    .prepare("SELECT id, name, email, updated_at FROM users WHERE status = 'removed' ORDER BY updated_at DESC")
    .all() as unknown as { id: string; name: string; email: string; updated_at: string }[];

  const invites = db()
    .prepare("SELECT COUNT(*) AS n FROM invites WHERE used_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at >= ?)")
    .get(day) as { n: number };

  const storage = storageTotals(day);
  const capacity = seatCapacity();
  const used = seatsUsed();
  const covered = rows.filter((row) => row.paid_through && row.paid_through >= day).length;
  const open = rows.filter((row) => row.open_id).length;

  return (
    <>
      <div className="row-between">
        <div>
          <h1>Active pool</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Who holds a seat, what they have paid for, and what is still open.
          </p>
        </div>
        <div className="row">
          <Link href="/admin/invites" className="btn btn-secondary">
            Invite tokens
          </Link>
          <Link href="/admin/settings#pricing" className="btn btn-primary">
            Edit pricing
          </Link>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Seats" value={`${used} / ${capacity}`} sub={`${Math.max(capacity - used, 0)} available`} />
        <Stat label="Covered" value={`${covered} / ${used}`} sub={`${used - covered} without coverage`} tone={covered < used ? "warn" : undefined} />
        <Stat label="Open invoices" value={String(open)} sub={`${formatMoney(rows.reduce((sum, row) => sum + (row.open_amount ?? 0), 0))} outstanding`} tone={open ? "warn" : undefined} />
        <Stat label="Invite tokens" value={String(Number(invites.n))} sub="unused and unexpired" />
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Seats in use</h2>
            <span className="muted small">
              {covered} covered · {open} open invoice(s) · {storage.reported} storage reading(s) reported
            </span>
          </div>
          <Link href="/admin/members" className="btn btn-ghost btn-sm">
            Manage members →
          </Link>
        </div>
        {rows.length === 0 ? (
          <Empty>No active members.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <TableHead
                columns={[
                  { label: "Member" },
                  { label: "Coverage" },
                  { label: "Open invoice" },
                  { label: "Storage" },
                  { label: "Action", align: "right" },
                ]}
              />
              <tbody>
                {rows.map((row) => {
                  const state = statusFor(row, settings, day);
                  const isCovered = row.paid_through ? row.paid_through >= day : false;
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="strong">{row.name}</div>
                        <div className="muted small">{row.email}</div>
                      </td>
                      <td>
                        <div className={isCovered ? "strong" : "muted"}>
                          {row.paid_through ? formatDate(row.paid_through) : "never"}
                        </div>
                        <div className="muted small">
                          {isCovered ? relativeDays(row.paid_through!, settings.plan.timezone) : "no coverage"}
                        </div>
                      </td>
                      <td>
                        {row.open_id ? (
                          <>
                            <StatusBadge status={row.open_status!} />
                            <div className="small">
                              {formatMoney(row.open_amount ?? 0)} · due {formatDate(row.open_due)}
                            </div>
                          </>
                        ) : (
                          <span className="muted small">none</span>
                        )}
                      </td>
                      <td>
                        <div className="small">
                          {state.reported ? `${state.usedGb.toFixed(1)} / ${state.quotaGb.toFixed(0)} GB` : "not reported"}
                        </div>
                        <div className="meter" style={{ width: 90 }} aria-hidden="true">
                          <span
                            className={state.over ? "bad" : state.percent >= settings.storage.warnPercent ? "warn" : ""}
                            style={{ width: `${Math.min(state.percent, 100)}%` }}
                          />
                        </div>
                      </td>
                      <td className="right">
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          <Link href={`/admin/preview/${row.id}`} className="btn btn-secondary btn-sm">
                            Preview
                          </Link>
                          <Link href="/admin/members" className="btn btn-secondary btn-sm">
                            Manage
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>Removed seats</h2>
            <span className="muted small">{removed.length} disabled</span>
          </div>
          {removed.length === 0 ? (
            <Empty>Nobody has been removed.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <TableHead columns={[{ label: "Member" }, { label: "Removed" }, { label: "Restore", align: "right" }]} />
                <tbody>
                  {removed.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="strong">{row.name}</div>
                        <div className="muted small">{row.email}</div>
                      </td>
                      <td className="small">{formatDate(row.updated_at.slice(0, 10))}</td>
                      <td className="right">
                        <Link href="/admin/members" className="btn btn-secondary btn-sm">
                          Restore in Members
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="card-body">
            <p className="hint" style={{ marginBottom: 0 }}>
              Removing a seat signs the member out, voids their open invoices and frees the seat. Their payment
              history stays. Restore them from Members if they come back.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Pool policy</h2>
          </div>
          <div className="card-body stack-sm small">
            <div className="row-between">
              <span>Plan</span>
              <span className="strong">{settings.plan.name}</span>
            </div>
            <div className="row-between">
              <span>Seats</span>
              <span>{settings.plan.seats}</span>
            </div>
            <div className="row-between">
              <span>Grace period</span>
              <span>{settings.plan.graceDays} days</span>
            </div>
            <div className="row-between">
              <span>Storage share</span>
              <span>{settings.storage.totalGb} GB ÷ {settings.storage.shareCount}</span>
            </div>
            <div className="row-between">
              <span>Quarterly</span>
              <span>
                {formatMoney(settings.pricing.firstTerm.quarterly)} → {formatMoney(settings.pricing.renewal.quarterly)}
              </span>
            </div>
            <div className="row-between">
              <span>Half-year</span>
              <span>
                {formatMoney(settings.pricing.firstTerm.semiannual)} → {formatMoney(settings.pricing.renewal.semiannual)}
              </span>
            </div>
            <div className="row-between">
              <span>Annual</span>
              <span>
                {formatMoney(settings.pricing.firstTerm.annual)} → {formatMoney(settings.pricing.renewal.annual)}
              </span>
            </div>
            <hr style={{ margin: "6px 0" }} />
            <Link href="/admin/settings" className="btn btn-secondary btn-sm">
              Change any of these
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
