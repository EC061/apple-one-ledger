import Link from "next/link";
import { formatDate, formatDateTime, formatMoney, relativeDays } from "@/lib/dates";
import { PLANS, PLAN_ORDER, priceFor } from "@/lib/pricing";
import { createInvoiceAction } from "@/app/actions/member";
import { updateProfileAction } from "@/app/actions/member";
import { logoutAllAction } from "@/app/actions/auth";
import { Empty, MethodBadge, Stat, StatusBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import TableHead from "@/components/TableHead";
import { NextTermNotice } from "@/components/PriceTerms";
import type { Settings } from "@/lib/settings";
import type { StorageStatus } from "@/lib/storage";
import type { Invoice, User } from "@/lib/types";

function storageBadge(storage: StorageStatus): string {
  if (!storage.reported) return "no data";
  return `${storage.percent.toFixed(0)}% used`;
}

function storageTone(storage: StorageStatus, warn: number): string {
  if (storage.over) return "badge-overdue";
  if (storage.percent >= warn) return "badge-warn";
  return "badge-paid";
}

function storageBar(storage: StorageStatus, warn: number): string {
  if (storage.over) return "bad";
  if (storage.percent >= warn) return "warn";
  return "";
}

function storageUsage(storage: StorageStatus): string {
  if (!storage.reported) return "No reading yet";
  return `${storage.usedGb.toFixed(1)} GB of ${storage.quotaGb.toFixed(1)} GB`;
}

function storageUpdated(storage: StorageStatus, settings: Settings): string {
  if (storage.over) return "Over your fair share — please free up space.";
  if (!storage.updatedAt) return "Not reported yet";
  const suffix = storage.stale ? " · outdated" : "";
  return `Updated ${formatDateTime(storage.updatedAt, settings.plan.timezone)}${suffix}`;
}

export function MemberStorageCard({ settings, storage }: { settings: Settings; storage: StorageStatus }) {
  if (!settings.storage.enabled) return null;
  const warn = settings.storage.warnPercent;

  return (
    <div className="card card-pad">
      <div className="row-between">
        <div>
          <h3>Your storage share</h3>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {settings.storage.totalGb} GB family pool split {settings.storage.shareCount} ways ={" "}
            {storage.quotaGb.toFixed(0)} GB each · fair-share guideline, not a hard cap
          </p>
        </div>
        <span className={`badge ${storageTone(storage, warn)}`}>{storageBadge(storage)}</span>
      </div>
      <div className="meter" aria-hidden="true">
        <span className={storageBar(storage, warn)} style={{ width: `${Math.min(storage.percent, 100)}%` }} />
      </div>
      <div className="row-between small muted">
        <span>{storageUsage(storage)}</span>
        <span>{storageUpdated(storage, settings)}</span>
      </div>
    </div>
  );
}

export function BillingSection({
  open,
  termIndex,
  settings,
}: {
  open: Invoice | null;
  termIndex: number;
  settings: Settings;
}) {
  return open ? (
    <OpenInvoicePanel invoice={open} settings={settings} />
  ) : (
    <PlanPicker termIndex={termIndex} settings={settings} />
  );
}

function OpenInvoicePanel({ invoice: open, settings }: { invoice: Invoice; settings: Settings }) {
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
  );
}

function PlanPicker({ termIndex, settings }: { termIndex: number; settings: Settings }) {
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
  );
}

export function HistoryCard({ history }: { history: Invoice[] }) {
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
    </>
  );
}

export function ProfileCards({ user }: { user: User }) {
  return (
    <>
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
      {covered ? (
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
  storage,
  settings,
  covered,
}: {
  user: User;
  open: Invoice | null;
  termIndex: number;
  storage: StorageStatus;
  settings: Settings;
  covered: boolean;
}) {
  return (
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
  );
}
