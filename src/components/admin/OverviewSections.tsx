import Link from "next/link";
import { formatDate, formatDateTime, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import { adminCreateInvoiceAction } from "@/app/actions/admin";
import { smtpConfigured } from "@/lib/email";
import { Empty, MethodBadge, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { Settings } from "@/lib/settings";
import type { FxRate, Invoice, Plan } from "@/lib/types";

type OpenInvoice = Invoice & { user_name: string; user_email: string };

export function OpenPaymentsCard({ open, settings }: { open: OpenInvoice[]; settings: Settings }) {
  return (
    <>
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
                  <th><span className="sr-only">Actions</span></th>
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
                      <div className="muted small">ref ¥{invoice.amount_cny.toFixed(2)}</div>
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
    </>
  );
}

export function UncoveredCard({ uncovered }: { uncovered: { id: string; name: string; email: string; paid_through: string | null }[] }) {
  return (
    <>
      {uncovered.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>No coverage, no invoice</h2>
              <span className="muted small">These members are not covered and have nothing open — bill them before the seat goes quiet.</span>
            </div>
            <span className="badge badge-warn">{uncovered.length}</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Covered until</th>
                  <th className="right">Create invoice</th>
                </tr>
              </thead>
              <tbody>
                {uncovered.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="strong">{member.name}</div>
                      <div className="muted small">{member.email}</div>
                    </td>
                    <td className="small">{member.paid_through ? formatDate(member.paid_through) : "never"}</td>
                    <td className="right">
                      <form action={adminCreateInvoiceAction} className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        <input type="hidden" name="userId" value={member.id} />
                        <select name="plan" className="select" defaultValue="quarterly" aria-label={`Term for ${member.name}`}>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PendingReviewCard({
  pendingPayments,
  settings,
}: {
  pendingPayments: {
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
  settings: Settings;
}) {
  return (
    <>
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
                  <th><span className="sr-only">Actions</span></th>
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
    </>
  );
}

export function ActivitySystemCards({
  events,
  settings,
  rate,
}: {
  events: { id: number; at: string; action: string; detail: string | null }[];
  settings: Settings;
  rate: FxRate | null;
}) {
  return (
    <>
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
