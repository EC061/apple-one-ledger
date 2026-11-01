import Link from "next/link";
import { formatDate, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS, PLAN_ORDER, priceFor } from "@/lib/pricing";
import { createInvoiceAction } from "@/app/actions/member";
import { updateProfileAction } from "@/app/actions/member";
import { logoutAllAction } from "@/app/actions/auth";
import { Empty, MethodBadge, Stat, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import TableHead from "@/components/TableHead";
import { NextTermNotice } from "@/components/PriceTerms";
import type { Settings } from "@/lib/settings";
import type { Invoice, User } from "@/lib/types";

export function BillingSection({
  open,
  termIndex,
  settings,
  readOnly = false,
  isAdmin = false,
}: {
  open: Invoice | null;
  termIndex: number;
  settings: Settings;
  readOnly?: boolean;
  isAdmin?: boolean;
}) {
  if (isAdmin) {
    return (
      <div className="card card-pad">
        <div className="row-between">
          <div>
            <h2>Admin seat</h2>
            <p className="muted small" style={{ marginBottom: 0 }}>
              This seat is always reserved and never billed. No invoice is created for the admin.
            </p>
          </div>
          <span className="badge badge-paid">No payment needed</span>
        </div>
      </div>
    );
  }

  return open ? (
    <OpenInvoicePanel invoice={open} settings={settings} readOnly={readOnly} />
  ) : (
    <PlanPicker termIndex={termIndex} settings={settings} readOnly={readOnly} />
  );
}

function OpenInvoicePanel({
  invoice: open,
  settings,
  readOnly,
}: {
  invoice: Invoice;
  settings: Settings;
  readOnly: boolean;
}) {
  return (
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
                      · ref ¥{open.amount_cny.toFixed(2)} @ {open.fx_rate.toFixed(4)}
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
                  {readOnly ? (
                    <span className="btn btn-primary" style={{ opacity: 0.55, pointerEvents: "none" }}>
                      {open.status === "submitted" ? "View payment status" : `Pay ${formatMoney(open.amount_usd)}`}
                    </span>
                  ) : (
                    <Link href={`/dashboard/pay/${open.id}`} className="btn btn-primary">
                      {open.status === "submitted" ? "View payment status" : `Pay ${formatMoney(open.amount_usd)}`}
                    </Link>
                  )}
                  <span className="muted small">
                    Reference <span className="mono">{open.reference}</span>
                  </span>
                </div>
              </div>
            </div>
  );
}

function PlanPicker({
  termIndex,
  settings,
  readOnly,
}: {
  termIndex: number;
  settings: Settings;
  readOnly: boolean;
}) {
  return (
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
                  const card = (
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
                      {readOnly ? (
                        <button type="button" className="btn btn-primary btn-block" disabled>
                          Choose {plan.label.toLowerCase()} · {formatMoney(price)}
                        </button>
                      ) : (
                        <SubmitButton className="btn btn-primary btn-block" pending="Creating invoice…">
                          Choose {plan.label.toLowerCase()} · {formatMoney(price)}
                        </SubmitButton>
                      )}
                    </div>
                  );
                  return readOnly ? (
                    <div key={key}>{card}</div>
                  ) : (
                    <form action={createInvoiceAction} key={key}>
                      <input type="hidden" name="plan" value={key} />
                      {card}
                    </form>
                  );
                })}
              </div>
            </div>
  );
}

export function HistoryCard({ history, readOnly = false }: { history: Invoice[]; readOnly?: boolean }) {
  return (
    <>
          <div className="card">
            <div className="card-head">
              <h2>Payment history</h2>
            </div>
            {history.length === 0 ? (
              <Empty>No invoices yet. Pick a term above to get started.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <TableHead
                    columns={[
                      { label: "Reference" },
                      { label: "Term" },
                      { label: "Amount" },
                      { label: "Method" },
                      { label: "Status" },
                    ]}
                  />
                  <tbody>
                    {history.map((invoice) => (
                      <tr key={invoice.id}>
                        <td className="mono small">
                          {readOnly ? (
                            invoice.reference
                          ) : (
                            <Link href={`/dashboard/pay/${invoice.id}`}>{invoice.reference}</Link>
                          )}
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
    </>
  );
}

export function ProfileCards({ user, readOnly = false }: { user: User; readOnly?: boolean }) {
  return (
    <>
          <div className="split">
            <div className="card">
              <div className="card-head">
                <h2>Your details</h2>
              </div>
              <div className="card-body">
                {readOnly ? (
                  <div className="form-grid">
                    <div className="field">
                      <span className="label">Name</span>
                      <div>{user.name}</div>
                    </div>
                    <div className="field">
                      <span className="label">Email</span>
                      <div>{user.email}</div>
                    </div>
                    <div className="full">
                      <span className="hint">Read-only preview — the member can edit these details.</span>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h2>Access</h2>
              </div>
              <div className="card-body stack-sm">
                <p className="muted small" style={{ marginBottom: 0 }}>
                  Signed in as <strong>{user.email}</strong>. If your password leaked, sign out everywhere and ask the
                  admin to set a new one.
                </p>
                {readOnly ? (
                  <span className="hint">Read-only preview — the member can sign out of all devices here.</span>
                ) : (
                  <form action={logoutAllAction}>
                    <SubmitButton className="btn btn-danger btn-sm" pending="Signing out…">
                      Sign out of all devices
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          </div>
    </>
  );
}

export function MemberHeader({
  user,
  settings,
  covered,
}: {
  user: User;
  settings: Settings;
  covered: boolean;
}) {
  return (
    <div className="row-between">
      <div>
        <h1>Hi, {user.name.split(" ")[0]}</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          {settings.plan.name} · {settings.plan.seats} seats in total
        </p>
      </div>
      {user.role === "admin" ? (
        <span className="badge badge-paid">No payment needed</span>
      ) : covered ? (
        <span className="badge badge-paid">Covered until {formatDate(user.paid_through)}</span>
      ) : (
        <span className="badge badge-overdue">No active coverage</span>
      )}
    </div>
  );
}

export function MemberStats({
  user,
  open,
  termIndex,
  settings,
  covered,
}: {
  user: User;
  open: Invoice | null;
  termIndex: number;
  settings: Settings;
  covered: boolean;
}) {
  return (
    <div className="grid grid-3">
      <Stat
        label="Coverage"
        value={
          user.role === "admin" ? "No payment needed" : user.paid_through ? formatDate(user.paid_through) : "Not covered"
        }
        sub={
          user.role === "admin"
            ? "admin seat is always reserved"
            : user.paid_through
              ? relativeDays(user.paid_through, settings.plan.timezone)
              : "Pick a term to start"
        }
        tone={user.role === "admin" ? undefined : covered ? undefined : "warn"}
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
    </div>
  );
}
