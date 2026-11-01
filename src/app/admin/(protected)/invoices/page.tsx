import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS, PLAN_ORDER } from "@/lib/pricing";
import {
  adminCreateInvoiceAction,
  adminMarkPaidAction,
  adminSendReminderAction,
  adminVoidInvoiceAction,
} from "@/app/actions/admin";
import { Empty, MethodBadge, Notice, StatusBadge } from "@/components/ui";
import { PendingPayments } from "@/components/admin/InvoiceSections";
import SubmitButton from "@/components/SubmitButton";
import type { Invoice, PaymentMethod, Plan } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS: { key: string; label: string; where: string }[] = [
  { key: "all", label: "All", where: "1=1" },
  { key: "open", label: "Open", where: "i.status IN ('awaiting_payment','submitted','overdue')" },
  { key: "overdue", label: "Overdue", where: "i.status = 'overdue'" },
  { key: "paid", label: "Paid", where: "i.status = 'paid'" },
  { key: "void", label: "Void", where: "i.status = 'void'" },
];

const ERRORS: Record<string, string> = {
  open: "That member already has an open invoice.",
  plan: "Pick a valid plan.",
  input: "Check the method and amount.",
  missing: "Invoice not found.",
  payment: "That pending payment is no longer available.",
  fx: "No USD→CNY rate is available. Set one under Settings → Exchange rate.",
};

interface Row extends Invoice {
  user_name: string;
  user_email: string;
  proof_url: string | null;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; saved?: string; created?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  const filter = FILTERS.find((item) => item.key === params.status) ?? FILTERS[1];

  const rows = db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email,
              (SELECT p.proof_url FROM payments p
               WHERE p.invoice_id = i.id AND p.proof_url IS NOT NULL
               ORDER BY p.created_at DESC LIMIT 1) AS proof_url
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE ${filter.where}
       ORDER BY i.created_at DESC LIMIT 200`,
    )
    .all() as unknown as Row[];

  const pending = db()
    .prepare(
      `SELECT p.*, u.name AS user_name, i.reference, i.amount_usd AS expected_usd
       FROM payments p JOIN invoices i ON i.id = p.invoice_id JOIN users u ON u.id = i.user_id
       WHERE p.status = 'pending' ORDER BY p.created_at DESC`,
    )
    .all() as {
    id: string;
    invoice_id: string;
    method: PaymentMethod;
    amount: number;
    currency: "USD" | "CNY";
    amount_usd: number;
    created_at: string;
    user_name: string;
    reference: string;
    expected_usd: number;
    proof_url: string | null;
  }[];

  const members = db()
    .prepare("SELECT id, name, email FROM users WHERE status = 'active' AND role = 'member' ORDER BY name")
    .all() as { id: string; name: string; email: string }[];

  return (
    <>
      {params.error ? (
        <Notice tone="error">{ERRORS[params.error] ?? "Something went wrong. Please try again."}</Notice>
      ) : null}
      {params.saved === "paid" ? <Notice tone="ok">Invoice marked paid and a receipt was emailed.</Notice> : null}
      {params.saved === "void" ? <Notice tone="ok">Invoice voided.</Notice> : null}
      {params.saved === "approved" ? <Notice tone="ok">Pending payment approved.</Notice> : null}
      {params.saved === "rejected" ? <Notice tone="ok">Pending payment rejected.</Notice> : null}
      {params.saved === "sent" ? <Notice tone="ok">Reminder sent.</Notice> : null}
      {params.saved && !["paid", "void", "approved", "rejected", "sent"].includes(params.saved) ? (
        <Notice tone="warn">The reminder was logged but not delivered. Check SMTP settings.</Notice>
      ) : null}
      {params.created ? <Notice tone="ok">Invoice created.</Notice> : null}

      <div className="row-between">
        <div>
          <h1>Invoices</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            USD amounts with a CNY reference; the payment-day rate is final.
          </p>
        </div>
      </div>

      <PendingPayments pending={pending} settings={settings} />

      <div className="card">
        <div className="card-head">
          <div className="tabs" style={{ marginBottom: 0, borderBottom: 0 }}>
            {FILTERS.map((item) => (
              <Link key={item.key} href={`/admin/invoices?status=${item.key}`} className={filter.key === item.key ? "active" : undefined}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty>No invoices in this view.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Member</th>
                  <th>Term</th>
                  <th className="right">Amount</th>
                  <th>Status</th>
                  <th>Paid</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="mono small">{invoice.reference}</td>
                    <td>
                      <div className="strong">{invoice.user_name}</div>
                      <div className="muted small">{invoice.user_email}</div>
                    </td>
                    <td className="small">
                      {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
                      <div className="muted">
                        {PLANS[invoice.plan as Plan].label} · term {invoice.term_index}
                      </div>
                    </td>
                    <td className="right">
                      {formatMoney(invoice.amount_usd)}
                      <div className="muted small">ref ¥{invoice.amount_cny.toFixed(2)}</div>
                    </td>
                    <td>
                      <StatusBadge status={invoice.status} />
                      <div className="muted small">due {relativeDays(invoice.due_date, settings.plan.timezone)}</div>
                    </td>
                    <td className="small">
                      {invoice.paid_at ? formatDateTime(invoice.paid_at, settings.plan.timezone) : <span className="muted">—</span>}
                      <div>
                        <MethodBadge method={invoice.method} />
                      </div>
                    </td>
                    <td className="right">
                      <details>
                        <summary className="btn btn-secondary btn-sm" style={{ display: "inline-flex", listStyle: "none" }}>
                          Manage
                        </summary>
                        <div className="stack-sm" style={{ marginTop: 10, textAlign: "left", minWidth: 300 }}>
                          {invoice.status !== "paid" && invoice.status !== "void" ? (
                            <form action={adminMarkPaidAction} className="stack-sm">
                              <input type="hidden" name="invoiceId" value={invoice.id} />
                              <div className="row" style={{ gap: 6 }}>
                                <select name="method" className="select" defaultValue={invoice.method ?? "venmo"} aria-label="Method">
                                  <option value="venmo">Venmo</option>
                                  <option value="zelle">Zelle</option>
                                  <option value="wechat">WeChat</option>
                                  <option value="alipay">Alipay</option>
                                </select>
                                <select name="currency" className="select" defaultValue="USD" aria-label="Currency">
                                  <option value="USD">USD</option>
                                  <option value="CNY">CNY</option>
                                </select>
                              </div>
                              <input
                                name="amount"
                                className="input"
                                defaultValue={invoice.amount_usd.toFixed(2)}
                                inputMode="decimal"
                                aria-label="Amount"
                              />
                              <input name="txRef" className="input" placeholder="Transaction reference" aria-label="Transaction reference" />
                              <label className="check small">
                                <input type="checkbox" name="partial" />
                                <span>Accept partial payment</span>
                              </label>
                              <SubmitButton className="btn btn-primary btn-sm" pending="Saving…">
                                Mark paid
                              </SubmitButton>
                            </form>
                          ) : null}

                          <div className="row" style={{ gap: 6 }}>
                            <Link href={`/dashboard/pay/${invoice.id}`} className="btn btn-secondary btn-sm">
                              View
                            </Link>
                            {invoice.proof_url ? (
                              <a href={invoice.proof_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                                Proof
                              </a>
                            ) : null}

                            {invoice.status !== "paid" && invoice.status !== "void" ? (
                              <>
                                <form action={adminSendReminderAction}>
                                  <input type="hidden" name="invoiceId" value={invoice.id} />
                                  <input type="hidden" name="kind" value="reminder" />
                                  <SubmitButton className="btn btn-secondary btn-sm" pending="Sending…">
                                    Remind
                                  </SubmitButton>
                                </form>
                                <form action={adminVoidInvoiceAction}>
                                  <input type="hidden" name="invoiceId" value={invoice.id} />
                                  <SubmitButton className="btn btn-danger btn-sm" pending="Voiding…">
                                    Void
                                  </SubmitButton>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Create an invoice</h2>
            <span className="muted small">Price is chosen automatically: first term for a new member, renewal afterwards.</span>
          </div>
        </div>
        <div className="card-body">
          {members.length === 0 ? (
            <Empty>Add a member first.</Empty>
          ) : (
            <form action={adminCreateInvoiceAction} className="row" style={{ alignItems: "flex-end" }}>
              <div className="field" style={{ minWidth: 220 }}>
                <label className="label" htmlFor="userId">
                  Member
                </label>
                <select id="userId" name="userId" className="select">
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ minWidth: 160 }}>
                <label className="label" htmlFor="plan">
                  Term
                </label>
                <select id="plan" name="plan" className="select" defaultValue="quarterly">
                  {PLAN_ORDER.map((plan) => (
                    <option key={plan} value={plan}>
                      {PLANS[plan].label}
                    </option>
                  ))}
                </select>
              </div>
              <SubmitButton className="btn btn-primary" pending="Creating…">
                Create invoice
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
