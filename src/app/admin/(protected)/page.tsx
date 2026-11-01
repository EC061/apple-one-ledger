import Link from "next/link";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatDateTime, formatMoney, relativeDays, today } from "@/lib/dates";
import { seatCapacity, seatsUsed } from "@/lib/auth";
import { latestStoredRate } from "@/lib/fx";
import { removalCandidates } from "@/lib/reminders";
import { storageTotals } from "@/lib/storage";
import { runJobsAction, sendDigestNowAction } from "@/app/actions/admin";
import { Notice, Stat } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { Invoice } from "@/lib/types";
import {
  ActivitySystemCards,
  OpenPaymentsCard,
  PendingReviewCard,
  StoragePoolCard,
  UncoveredCard,
} from "@/components/admin/OverviewSections";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ran?: string; digest?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const settings = getSettings();
  const day = today(settings.plan.timezone);
  const monthStart = `${day.slice(0, 7)}-01`;

  const totals = db()
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status='paid' THEN amount_usd ELSE 0 END),0) AS collected,
        COALESCE(SUM(CASE WHEN status IN ('awaiting_payment','submitted','overdue') THEN amount_usd ELSE 0 END),0) AS outstanding,
        COALESCE(SUM(CASE WHEN status='overdue' THEN 1 ELSE 0 END),0) AS overdue,
        COALESCE(SUM(CASE WHEN status='paid' AND paid_at >= ? THEN amount_usd ELSE 0 END),0) AS month
       FROM invoices`,
    )
    .get(monthStart) as { collected: number; outstanding: number; overdue: number; month: number };

  const open = db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE i.status IN ('awaiting_payment','submitted','overdue')
       ORDER BY CASE i.status WHEN 'overdue' THEN 0 WHEN 'submitted' THEN 1 ELSE 2 END, i.due_date`,
    )
    .all() as unknown as (Invoice & { user_name: string; user_email: string })[];

  const uncovered = db()
    .prepare(
      `SELECT u.id, u.name, u.email, u.paid_through
       FROM users u
       WHERE u.status = 'active' AND u.role = 'member'
         AND (u.paid_through IS NULL OR u.paid_through < ?)
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.user_id = u.id AND i.status IN ('awaiting_payment','submitted','overdue')
         )
       ORDER BY u.paid_through IS NOT NULL, u.paid_through`,
    )
    .all(day) as { id: string; name: string; email: string; paid_through: string | null }[];

  const pendingPayments = db()
    .prepare(
      `SELECT p.*, u.name AS user_name, i.reference
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN users u ON u.id = i.user_id
       WHERE p.status = 'pending'
       ORDER BY p.created_at DESC LIMIT 10`,
    )
    .all() as {
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

  const events = db()
    .prepare("SELECT * FROM events ORDER BY id DESC LIMIT 8")
    .all() as { id: number; at: string; action: string; detail: string | null }[];

  const removals = removalCandidates(day);
  const storage = storageTotals();
  const storageUsers = db()
    .prepare(
      "SELECT id, name, email, storage_used_gb, storage_updated_at FROM users WHERE status = 'active' ORDER BY storage_used_gb DESC",
    )
    .all() as { id: string; name: string; email: string; storage_used_gb: number; storage_updated_at: string | null }[];
  const rate = latestStoredRate();
  const nextDue = open[0]?.due_date;

  return (
    <>
      {params.ran !== undefined ? (
        <Notice tone="ok">
          Daily jobs finished — {params.ran} reminder(s) sent{params.digest === "1" ? ", digest delivered" : ""}.
        </Notice>
      ) : null}
      {params.saved === "digest" ? <Notice tone="ok">Digest sent to your email.</Notice> : null}
      {params.saved === "digest-skipped" ? (
        <Notice tone="warn">Digest skipped — configure SMTP in Settings first.</Notice>
      ) : null}

      <div className="row-between">
        <div>
          <h1>Overview</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            {settings.plan.name} · {seatsUsed()} of {seatCapacity()} seats · next due{" "}
            {nextDue ? `${formatDate(nextDue)} (${relativeDays(nextDue, settings.plan.timezone)})` : "nothing open"}
          </p>
        </div>
        <div className="row">
          <form action={sendDigestNowAction}>
            <SubmitButton className="btn btn-secondary" pending="Sending…">
              Send digest now
            </SubmitButton>
          </form>
          <form action={runJobsAction}>
            <SubmitButton className="btn btn-primary" pending="Running…">
              Run daily jobs
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Collected all time" value={formatMoney(totals.collected)} sub={`${formatMoney(totals.month)} this month`} />
        <Stat
          label="Outstanding"
          value={formatMoney(totals.outstanding)}
          sub={`${open.length} open invoice${open.length === 1 ? "" : "s"}`}
          tone={totals.outstanding > 0 ? "warn" : undefined}
        />
        <Stat
          label="Overdue"
          value={String(totals.overdue)}
          sub={`Grace period ${settings.plan.graceDays} days`}
          tone={totals.overdue > 0 ? "bad" : undefined}
        />
        <Stat label="Seats used" value={`${seatsUsed()} / ${seatCapacity()}`} sub={rate ? `USD→CNY ${rate.rate.toFixed(4)} (${rate.date})` : "No FX rate cached"} />
      </div>

      {removals.length > 0 ? (
        <Notice tone="error">
          <strong>{removals.length} seat(s) past the grace period.</strong> Reminders have gone out; remove the member
          from <Link href="/admin/members">Members</Link> if payment does not arrive.{" "}
          {removals.map((row) => `${row.user_name} (${formatDate(row.due_date)})`).join(", ")}.
        </Notice>
      ) : null}

      <OpenPaymentsCard open={open} settings={settings} />

      <UncoveredCard uncovered={uncovered} />

      <PendingReviewCard pendingPayments={pendingPayments} settings={settings} />

      <StoragePoolCard settings={settings} storage={storage} storageUsers={storageUsers} />

      <ActivitySystemCards events={events} settings={settings} rate={rate} />
    </>
  );
}
