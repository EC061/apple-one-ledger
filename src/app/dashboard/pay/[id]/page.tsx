import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate } from "@/lib/dates";
import { PLANS } from "@/lib/pricing";
import { paymentDestinations } from "@/lib/payment-destinations";
import { getCurrentRate } from "@/lib/fx";
import TopBar from "@/components/TopBar";
import {
  PayActionPanel,
  PayAmountCard,
  PayDestinations,
  PayStatusNotices,
} from "@/components/member/PaySections";
import { Notice, StatusBadge } from "@/components/ui";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  method: "Choose a valid payment method.",
  amount: "Enter an amount greater than zero.",
};

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(id) as unknown as Invoice | undefined;
  if (!invoice) notFound();
  if (invoice.user_id !== user.id && user.role !== "admin") notFound();

  const settings = getSettings();
  const pay = settings.payments;
  const isAdminView = user.role === "admin";

  const isOpen = invoice.status === "awaiting_payment" || invoice.status === "overdue";
  const currentRate = isOpen ? await getCurrentRate().catch(() => null) : null;
  const fxRate = currentRate && currentRate.source !== "fallback" ? currentRate.rate : invoice.fx_rate;
  const amountCny = Math.round(invoice.amount_usd * (fxRate || 1) * 100) / 100;

  const methodRows = paymentDestinations(pay);
  const configuredMethods = methodRows
    .filter((row) => row.value || row.qr)
    .map((row) => ({ value: row.key, label: row.label }));

  return (
    <div className="page">
      <TopBar user={user} area={isAdminView ? "admin" : "member"} />
      <main className="grow">
        <div className="container stack">
          <div className="row-between">
            <div>
              <div className="row small muted" style={{ marginBottom: 2 }}>
                <Link href={isAdminView ? "/admin/invoices" : "/dashboard"}>← Back</Link>
              </div>
              <h1>Pay your share</h1>
              <p className="muted" style={{ marginBottom: 0 }}>
                {PLANS[invoice.plan].label} · {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}
              </p>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          {error ? (
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Please try again."}</Notice>
          ) : null}

          <PayStatusNotices invoice={invoice} settings={settings} />

          <div className="split pay-split">
            <div className="stack pay-main">
              <div className="pay-amount">
                <PayAmountCard invoice={invoice} settings={settings} amountCny={amountCny} fxRate={fxRate} />
              </div>

              <div className="pay-action">
                <PayActionPanel
                  invoice={invoice}
                  isAdminView={isAdminView}
                  configuredMethods={configuredMethods}
                  amountCny={amountCny}
                  fxRate={fxRate}
                />
              </div>
            </div>

            <PayDestinations
              settings={settings}
              invoice={invoice}
              methodRows={methodRows}
              fxRate={fxRate}
              fxDate={currentRate && currentRate.source !== "fallback" ? currentRate.date : invoice.fx_date}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
