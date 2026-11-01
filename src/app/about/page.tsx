import Link from "next/link";
import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/dates";
import { PLANS, PLAN_ORDER, perSeatMonthly } from "@/lib/pricing";
import { Brand } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "How the plan works",
  description: "Rules, pricing, payment methods, reminders and seat policy for the shared family plan.",
};

const METHODS = [
  { name: "WeChat Pay", note: "CNY transfer, reference in the note" },
  { name: "Alipay", note: "CNY transfer, reference in the note" },
  { name: "Venmo", note: "USD transfer, reference in the note" },
  { name: "Zelle", note: "USD transfer, reference in the note" },
];

export default function AboutPage() {
  const settings = getSettings();
  const { plan, pricing, storage } = settings;
  const seatCost = perSeatMonthly(pricing, plan.seats);
  const quota = storage.totalGb / Math.max(storage.shareCount, 1);

  return (
    <div className="page">
      <header className="topbar">
        <div className="container topbar-inner">
          <Brand />
          <div className="topbar-right">
            <Link href="/about" className="btn btn-ghost btn-sm">
              How it works
            </Link>
            <Link href="/login" className="btn btn-primary btn-sm">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="grow">
        <div className="container stack" style={{ maxWidth: 860 }}>
          <div>
            <span className="eyebrow">Invite-only · {plan.seats} seats</span>
            <h1 style={{ marginTop: 12 }}>How this family plan works</h1>
            <p className="muted" style={{ fontSize: 17, maxWidth: 700 }}>
              Everything you agree to before your first payment: what the plan costs, how terms and renewals
              are priced, how to pay, and when reminders or seat changes happen.
            </p>
          </div>

          <div className="card card-pad">
            <div className="row-between">
              <div>
                <h2>{plan.name}</h2>
                <p className="muted small" style={{ marginBottom: 0 }}>
                  {formatMoney(pricing.monthlyTotalUsd)} per month for the whole plan, split {plan.seats} ways.
                  Term prices are rounded to whole dollars.
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stat-value">{formatMoney(seatCost)}</div>
                <div className="muted small">per seat / month</div>
              </div>
            </div>
          </div>

          <div>
            <h2>Term pricing</h2>
            <div className="price-grid">
              {PLAN_ORDER.map((key) => {
                const definition = PLANS[key];
                return (
                  <div key={key} className="price-card">
                    <div className="price-name">{definition.label}</div>
                    <div className="price-amount">
                      {formatMoney(pricing.firstTerm[key])} <span>first term</span>
                    </div>
                    <div className="price-note">{definition.months} months of coverage</div>
                    <div className="price-renew">
                      From the second term: {formatMoney(pricing.renewal[key])}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="disclosure">
            <h3>Billing rules</h3>
            <ul>
              <li>
                <strong>First term</strong> is an introductory flat price.{" "}
                <strong>Every later term</strong> renews at the price shown above — the invoice always states
                which one applies before you pay.
              </li>
              <li>
                An invoice covers a fixed period (3, 6 or 12 months). Coverage starts the day after your current
                paid-through date, or today if you have none.
              </li>
              <li>
                <strong>USD and CNY:</strong> each invoice locks the USD→CNY rate on its issue date, so the CNY
                amount does not move after you receive it.
              </li>
              <li>
                Payment is due on the invoice date. Reminders are emailed before and after the due date. After a{" "}
                {plan.graceDays}-day grace period the seat is flagged for removal.
              </li>
            </ul>
          </div>

          <div>
            <h2>Payment methods</h2>
            <p className="muted small">
              Pay in USD or CNY, then report the payment in the dashboard with its amount and transaction
              number. The admin reviews it and you get a receipt by email.
            </p>
            <div className="grid grid-4">
              {METHODS.map((method) => (
                <div key={method.name} className="card card-pad">
                  <h3>{method.name}</h3>
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    {method.note}
                  </p>
                </div>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              Exact handles and QR codes are shown on your own invoice after you sign in — they are not
              published on this page.
            </p>
          </div>

          <div className="grid grid-3">
            <div className="card card-pad">
              <h3>Email you will receive</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>
                Invite or access code, reminders before the due date, overdue notices, a removal warning, and a
                receipt once a payment is confirmed. The admin can also send a daily digest.
              </p>
            </div>
            <div className="card card-pad">
              <h3>Storage share</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>
                The {storage.totalGb} GB iCloud+ pool is split {storage.shareCount} ways: about{" "}
                {quota.toFixed(0)} GB each. This is a fair-share guideline, not a hard cap. Exceeding it emails
                you and the admin.
              </p>
            </div>
            <div className="card card-pad">
              <h3>Access and seats</h3>
              <p className="muted small" style={{ marginBottom: 0 }}>
                Joining requires a one-time invite token from the admin; there are {plan.seats} seats in total.
                The admin can disable a seat at any time, which signs that person out and frees the seat for
                someone else.
              </p>
            </div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <Link href="/login" className="btn btn-primary">
              Sign in with your access code
            </Link>
            <Link href="/" className="btn btn-secondary">
              Back to the overview
            </Link>
          </div>
        </div>
      </main>

      <footer className="footer">
        <div className="container row-between">
          <span>{plan.name}</span>
          <span className="muted">WeChat · Alipay · Venmo · Zelle</span>
        </div>
      </footer>
    </div>
  );
}
