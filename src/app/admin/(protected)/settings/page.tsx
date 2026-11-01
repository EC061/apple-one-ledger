import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { formatMoney, today } from "@/lib/dates";
import { perSeatMonthly } from "@/lib/pricing";
import { latestStoredRate } from "@/lib/fx";
import { smtpConfigured } from "@/lib/email";
import { Notice } from "@/components/ui";
import {
  AdminProfileCard,
  EmailLogCard,
  FxCard,
  PaymentDetailsCard,
  PlanPricingCard,
  RemindersCard,
  SmtpCard,
  StorageCard,
} from "@/components/settings/SettingsSections";

export const dynamic = "force-dynamic";

const SAVED: Record<string, string> = {
  plan: "Plan and pricing saved.",
  payments: "Payment details saved.",
  smtp: "SMTP settings saved.",
  fx: "Exchange-rate settings saved.",
  reminders: "Reminder settings saved.",
  storage: "Storage settings saved.",
  profile: "Profile updated.",
  "smtp-test": "Test email sent — check the inbox.",
  "fx-refresh": "Exchange rate refreshed.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  const { plan, pricing, smtp, fx } = settings;
  const rate = latestStoredRate();
  const seatCost = perSeatMonthly(pricing, plan.seats);

  return (
    <>
      {params.saved ? <Notice tone="ok">{(params.saved && SAVED[params.saved]) ?? "Saved."}</Notice> : null}
      {params.error ? (
        <Notice tone="error">That change could not be saved. Check the server log for the exact error.</Notice>
      ) : null}

      <div className="row-between">
        <div>
          <h1>Settings</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Everything is stored in SQLite except secrets in the environment.
          </p>
        </div>
        <div className="row small muted">
          <Link href="#pricing">Pricing</Link>·<Link href="#payments">Payments</Link>·<Link href="#email">Email</Link>·
          <Link href="#fx">FX</Link>·<Link href="#reminders">Reminders</Link>·<Link href="#storage">Storage</Link>·
          <Link href="#profile">Profile</Link>
        </div>
      </div>

      <div className="grid grid-4">
        <div className="stat">
          <div className="stat-label">Per seat / month</div>
          <div className="stat-value">{formatMoney(seatCost)}</div>
          <div className="stat-sub">{formatMoney(pricing.monthlyTotalUsd)} ÷ {plan.seats}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Seats</div>
          <div className="stat-value">{plan.seats}</div>
          <div className="stat-sub">admin + {plan.seats - 1} members</div>
        </div>
        <div className="stat">
          <div className="stat-label">USD → CNY</div>
          <div className="stat-value">{rate ? rate.rate.toFixed(4) : "—"}</div>
          <div className="stat-sub">{fx.provider === "manual" ? "manual override" : rate ? `as of ${rate.date}` : "not fetched"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Email</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {smtpConfigured() ? "Configured" : "Not configured"}
          </div>
          <div className="stat-sub">{today(plan.timezone)}</div>
        </div>
      </div>

      <PlanPricingCard />
      <PaymentDetailsCard />
      <SmtpCard />
      <FxCard />
      <RemindersCard />
      <StorageCard />
      <AdminProfileCard />
      <EmailLogCard />
    </>
  );
}
