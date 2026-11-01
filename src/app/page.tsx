import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/dates";
import { PLANS, PLAN_ORDER, perSeatMonthly } from "@/lib/pricing";
import { Brand } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const settings = getSettings();
  const user = await getCurrentUser();
  const { pricing, plan } = settings;
  const seatCost = perSeatMonthly(pricing, plan.seats);

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand />
          <div className="topbar-right">
            {user ? (
              <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="btn btn-primary btn-sm">
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/admin/login" className="btn btn-ghost btn-sm">
                  Admin
                </Link>
                <Link href="/login" className="btn btn-secondary btn-sm">
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="grow">
        <section className="hero">
          <div className="container">
            <span className="eyebrow">Invite-only · {plan.seats} seats</span>
            <h1>One family plan. Six people. Zero spreadsheets.</h1>
            <p className="lede">
              A private ledger for our shared {plan.name} subscription. See exactly what you owe, pay in USD or
              CNY, and keep your seat covered — no group chat archaeology.
            </p>
            <div className="row">
              <Link href="/login" className="btn btn-primary">
                Sign in with your code
              </Link>
              <Link href="/admin/login" className="btn btn-secondary">
                Admin sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="container stack" style={{ paddingBottom: 56 }}>
          <div className="card card-pad">
            <div className="row-between">
              <div>
                <h2>Cost basis</h2>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  {formatMoney(pricing.monthlyTotalUsd)} per month for the whole plan, split {plan.seats} ways.
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stat-value">{formatMoney(seatCost)}</div>
                <div className="muted small">per seat / month</div>
              </div>
            </div>
          </div>

          <div>
            <h2>Choose a term</h2>
            <p className="muted small">Pay up front, in whichever cadence is easiest for you.</p>
          </div>

          <div className="price-grid">
            {PLAN_ORDER.map((key, index) => {
              const definition = PLANS[key];
              const first = pricing.firstTerm[key];
              const renewal = pricing.renewal[key];
              return (
                <div key={key} className={`price-card ${index === 1 ? "featured" : ""}`}>
                  <div className="price-name">{definition.label}</div>
                  <div className="price-amount">
                    {formatMoney(first)} <span>first term</span>
                  </div>
                  <div className="price-note">{definition.cadence} · {definition.months} months of coverage</div>
                  <div className="price-renew">
                    Renews at {formatMoney(renewal)} from the second term
                  </div>
                </div>
              );
            })}
          </div>

          <div className="disclosure">
            <h3>Read this before your first payment</h3>
            <ul>
              <li>
                <strong>First term is flat:</strong> {formatMoney(pricing.firstTerm.quarterly)} quarterly,{" "}
                {formatMoney(pricing.firstTerm.semiannual)} half-year, {formatMoney(pricing.firstTerm.annual)} annual.
                That is the exact amount charged — no fee added at checkout.
              </li>
              <li>
                <strong>From the second term onward</strong> the price changes to{" "}
                {formatMoney(pricing.renewal.quarterly)} quarterly, {formatMoney(pricing.renewal.semiannual)} half-year,{" "}
                {formatMoney(pricing.renewal.annual)} annual. Your invoice always shows which price applies before you pay.
              </li>
              <li>
                <strong>CNY payments</strong> use the USD→CNY rate captured the day the invoice is issued. The rate and the
                resulting CNY amount are locked on your invoice.
              </li>
              <li>
                <strong>Pay by</strong> WeChat Pay, Alipay, Venmo, or Zelle, then confirm in the dashboard with the
                reference code on your invoice.
              </li>
              <li>
                <strong>Reminders</strong> go out by email before the due date. Seats unpaid after a {plan.graceDays}-day
                grace period are flagged for removal.
              </li>
              <li>
                <strong>Automatic matching:</strong> when a payment arrives with your reference code, the ledger can
                reconcile it for you — otherwise the admin confirms it manually.
              </li>
            </ul>
          </div>

          <div className="grid grid-3">
            <div className="card card-pad">
              <h3>1. Claim your seat</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>
                Open the invite link the admin sends you. It is tied to this deployment&apos;s HTTPS address and can
                only be used once.
              </p>
            </div>
            <div className="card card-pad">
              <h3>2. Pick a term</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>
                Quarterly, half-year, or annual. Your invoice shows the USD amount, the locked CNY equivalent, and a
                unique reference code.
              </p>
            </div>
            <div className="card card-pad">
              <h3>3. Pay and confirm</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>
                Send the money with the reference in the note. The ledger records it, emails a receipt, and shows your
                coverage end date.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container row-between">
          <span>
            {plan.name} · {plan.seats} seats · self-hosted
          </span>
          <span className="row" style={{ gap: 14 }}>
            <Link href="/login">Sign in</Link>
            <Link href="/admin/login">Admin</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
