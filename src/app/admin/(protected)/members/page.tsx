import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, today } from "@/lib/dates";
import { seatCapacity, seatsUsed } from "@/lib/auth";
import { statusFor } from "@/lib/storage";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import {
  createMemberAction,
  resetMemberCodeAction,
  setMemberStatusAction,
  setPaidThroughAction,
  updateMemberAction,
  adminCreateInvoiceAction,
  updateMemberStorageAction,
} from "@/app/actions/admin";
import { MemberBadge, Notice, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import AccessCodeFlash from "@/components/AccessCodeFlash";
import type { InvoiceStatus, MemberStatus, Plan, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Name or email is invalid.",
  full: "All seats are taken. Remove a member first.",
  exists: "That email is already in use.",
  missing: "Member not found.",
  date: "Use a YYYY-MM-DD date.",
  storage: "Enter storage usage in GB (0 or more).",
  admin: "The admin account cannot be removed.",
};

interface Row {
  id: string;
  role: Role;
  name: string;
  email: string;
  status: MemberStatus;
  paid_through: string | null;
  note: string | null;
  storage_used_gb: number;
  storage_updated_at: string | null;
  open_id: string | null;
  open_amount: number | null;
  open_status: InvoiceStatus | null;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; created?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  const day = today(settings.plan.timezone);

  const rows = db()
    .prepare(
      `SELECT u.id, u.role, u.name, u.email, u.status, u.paid_through, u.note,
              u.storage_used_gb, u.storage_updated_at,
              i.id AS open_id, i.amount_usd AS open_amount, i.status AS open_status
       FROM users u
       LEFT JOIN invoices i ON i.user_id = u.id AND i.status IN ('awaiting_payment','submitted','overdue')
       ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, u.created_at`,
    )
    .all() as unknown as Row[];

  return (
    <>
      <AccessCodeFlash />

      {params.error ? <Notice tone="error">{ERRORS[params.error] ?? params.error}</Notice> : null}
      {params.created ? <Notice tone="ok">Member created. Send them the access code above.</Notice> : null}
      {params.reset ? <Notice tone="ok">Access code reset. Any existing sessions were signed out.</Notice> : null}
      {params.saved ? <Notice tone="ok">Saved.</Notice> : null}

      <div className="row-between">
        <div>
          <h1>Members</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {seatsUsed()} of {seatCapacity()} seats used · {settings.plan.seats}-way split
          </p>
        </div>
        <Link href="/admin/invites" className="btn btn-secondary">
          Invite by link instead
        </Link>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Current seats</h2>
            <span className="muted small">Coverage is driven by paid invoices; you can override it for special cases.</span>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Paid through</th>
                <th>Storage</th>
                <th>Open invoice</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const covered = row.paid_through ? row.paid_through >= day : false;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="strong">
                        {row.name} {row.role === "admin" ? <span className="pill">admin</span> : null}
                      </div>
                      <div className="muted small">{row.email}</div>
                      {row.note ? <div className="muted small">“{row.note}”</div> : null}
                    </td>
                    <td>
                      <MemberBadge status={row.status} />
                    </td>
                    <td>
                      <div className={covered ? "strong" : "muted"}>{row.paid_through ? formatDate(row.paid_through) : "—"}</div>
                      <div className="muted small">{covered ? "covered" : "not covered"}</div>
                    </td>
                    <td>
                      {(() => {
                        const state = statusFor(row, settings);
                        return (
                          <>
                            <div className="small">
                              {state.reported ? `${state.usedGb.toFixed(1)} / ${state.quotaGb.toFixed(0)} GB` : "Not reported"}
                            </div>
                            <div className="meter" style={{ width: 90 }}>
                              <span
                                className={state.over ? "bad" : state.percent >= settings.storage.warnPercent ? "warn" : ""}
                                style={{ width: `${Math.min(state.percent, 100)}%` }}
                              />
                            </div>
                            {state.over ? <span className="badge badge-overdue">over share</span> : null}
                          </>
                        );
                      })()}
                    </td>
                    <td>
                      {row.open_id ? (
                        <>
                          <StatusBadge status={row.open_status!} />
                          <div className="small">{formatMoney(row.open_amount ?? 0)}</div>
                          <Link href={`/dashboard/pay/${row.open_id}`} className="small">
                            open →
                          </Link>
                        </>
                      ) : (
                        <span className="muted small">none</span>
                      )}
                    </td>
                    <td className="right">
                      <details>
                        <summary className="btn btn-secondary btn-sm" style={{ display: "inline-flex", listStyle: "none" }}>
                          Manage
                        </summary>
                        <div className="stack-sm" style={{ marginTop: 10, textAlign: "left", minWidth: 260 }}>
                          {row.role === "admin" ? (
                            <p className="hint" style={{ marginBottom: 0 }}>
                              Admin account — edit its profile under Settings.
                            </p>
                          ) : (
                            <>
                              <form action={resetMemberCodeAction}>
                                <input type="hidden" name="userId" value={row.id} />
                                <SubmitButton className="btn btn-secondary btn-sm btn-block" pending="Resetting…">
                                  Reset access code
                                </SubmitButton>
                              </form>

                              {row.open_id ? null : (
                                <form action={adminCreateInvoiceAction} className="row" style={{ gap: 6 }}>
                                  <input type="hidden" name="userId" value={row.id} />
                                  <select name="plan" className="select" style={{ width: "auto", flex: 1 }} defaultValue="quarterly">
                                    {PLAN_ORDER.map((plan) => (
                                      <option key={plan} value={plan}>
                                        {PLANS[plan as Plan].label}
                                      </option>
                                    ))}
                                  </select>
                                  <SubmitButton className="btn btn-secondary btn-sm" pending="Creating…">
                                    Invoice
                                  </SubmitButton>
                                </form>
                              )}

                              <form action={setMemberStatusAction}>
                                <input type="hidden" name="userId" value={row.id} />
                                <input type="hidden" name="status" value={row.status === "active" ? "removed" : "active"} />
                                <SubmitButton
                                  className={`btn btn-sm btn-block ${row.status === "active" ? "btn-danger" : "btn-secondary"}`}
                                  pending="Updating…"
                                >
                                  {row.status === "active" ? "Remove seat" : "Restore seat"}
                                </SubmitButton>
                              </form>
                            </>
                          )}

                          <form action={updateMemberStorageAction} className="row" style={{ gap: 6 }}>
                            <input type="hidden" name="userId" value={row.id} />
                            <input
                              name="usedGb"
                              type="number"
                              min={0}
                              step="0.1"
                              className="input"
                              defaultValue={Number(row.storage_used_gb || 0).toFixed(1)}
                              aria-label="Storage used (GB)"
                              style={{ flex: 1 }}
                            />
                            <SubmitButton className="btn btn-secondary btn-sm" pending="…">
                              Save GB
                            </SubmitButton>
                          </form>

                          <form action={setPaidThroughAction} className="row" style={{ gap: 6 }}>
                            <input type="hidden" name="userId" value={row.id} />
                            <input
                              type="date"
                              name="paidThrough"
                              className="input"
                              defaultValue={row.paid_through ?? ""}
                              aria-label="Paid through date"
                              style={{ flex: 1 }}
                            />
                            <SubmitButton className="btn btn-secondary btn-sm" pending="…">
                              Set date
                            </SubmitButton>
                          </form>

                          <form action={updateMemberAction} className="stack-sm">
                            <input type="hidden" name="userId" value={row.id} />
                            <input name="name" className="input" defaultValue={row.name} aria-label="Name" />
                            <input name="email" type="email" className="input" defaultValue={row.email} aria-label="Email" />
                            <input name="note" className="input" defaultValue={row.note ?? ""} placeholder="Note" aria-label="Note" />
                            <SubmitButton className="btn btn-secondary btn-sm" pending="Saving…">
                              Save details
                            </SubmitButton>
                          </form>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Add a member directly</h2>
            <span className="muted small">Generates an access code you can hand over. Invite links are usually nicer.</span>
          </div>
        </div>
        <div className="card-body">
          <form action={createMemberAction} className="form-grid">
            <div className="field">
              <label className="label" htmlFor="new-name">
                Name
              </label>
              <input id="new-name" name="name" className="input" placeholder="Alex Chen" required />
            </div>
            <div className="field">
              <label className="label" htmlFor="new-email">
                Email
              </label>
              <input id="new-email" name="email" type="email" className="input" placeholder="alex@example.com" required />
            </div>
            <div className="field full">
              <label className="label" htmlFor="new-note">
                Note (optional)
              </label>
              <input id="new-note" name="note" className="input" placeholder="e.g. pays in CNY" />
            </div>
            <div className="full">
              <SubmitButton className="btn btn-primary" pending="Creating…">
                Create member
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
