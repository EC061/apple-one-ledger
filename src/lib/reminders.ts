import "server-only";
import { db } from "./db";
import { addDays, daysBetween, formatDate, formatMoney, today } from "./dates";
import { getSettings } from "./settings";
import { latestStoredRate, refreshRate } from "./fx";
import { markOverdue } from "./billing";
import {
  sendDigestEmail,
  sendReminderEmail,
  sendRemovalWarningEmail,
  sendRenewalAdminEmail,
  sendRenewalNoticeEmail,
} from "./email";
import { checkStorage } from "./storage";
import { getBaseUrl } from "./url";
import { getAdmin, seatCapacity, seatsUsed } from "./auth";
import type { Invoice, User } from "./types";

export interface InvoiceWithUser extends Invoice {
  user_name: string;
  user_email: string;
  user_status: string;
}

export function openInvoices(): InvoiceWithUser[] {
  return db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email, u.status AS user_status
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE i.status IN ('awaiting_payment','submitted','overdue')
       ORDER BY i.due_date ASC`,
    )
    .all() as unknown as InvoiceWithUser[];
}

function asUser(row: InvoiceWithUser): User {
  return {
    id: row.user_id,
    role: "member",
    name: row.user_name,
    email: row.user_email,
    access_code_hash: null,
    password_hash: null,
    status: row.user_status as unknown as User["status"],
    paid_through: null,
    note: null,
    storage_used_gb: 0,
    storage_updated_at: null,
    created_at: "",
    updated_at: "",
  };
}

export async function sendDueReminders(day: string): Promise<number> {
  const settings = getSettings();
  const baseUrl = await getBaseUrl();
  const reminderDays = new Set(settings.reminders.daysBefore);
  const jobs: Array<() => Promise<{ status: string }>> = [];

  for (const invoice of openInvoices()) {
    if (invoice.user_status !== "active") continue;
    // Already reported by the member: wait for the admin, do not dun them.
    if (invoice.status === "submitted") continue;
    if (invoice.created_at.slice(0, 10) === day) continue; // invoice email already sent
    const daysLeft = daysBetween(day, invoice.due_date);
    const user = asUser(invoice);

    if (daysLeft <= -settings.plan.graceDays) {
      // Past the grace period: periodic nudge that the seat will be removed.
      if (Math.abs(daysLeft) % Math.max(settings.reminders.removalWarningDays, 1) === 0) {
        jobs.push(() => sendRemovalWarningEmail({ user, invoice, baseUrl }));
      }
      continue;
    }

    if (daysLeft < 0) {
      if (Math.abs(daysLeft) % Math.max(settings.reminders.overdueEveryDays, 1) === 0) {
        jobs.push(() => sendReminderEmail({ user, invoice, baseUrl, kind: "overdue" }));
      }
      continue;
    }

    if (reminderDays.has(daysLeft)) {
      jobs.push(() => sendReminderEmail({ user, invoice, baseUrl, kind: "reminder" }));
    }
  }

  const results = await Promise.all(jobs.map((job) => job()));
  return results.filter((result) => result.status === "sent").length;
}

/**
 * "Coverage ends in N days" notices, based on paid_through rather than an
 * invoice. Members who already have an open invoice are skipped.
 */
export async function sendRenewalNotices(day: string): Promise<number> {
  const settings = getSettings();
  const days = Math.max(settings.reminders.renewalNoticeDays, 1);
  const target = addDays(day, days);

  const rows = db()
    .prepare(
      `SELECT u.* FROM users u
       WHERE u.status = 'active' AND u.paid_through = ?
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.user_id = u.id AND i.status IN ('awaiting_payment','submitted','overdue')
         )`,
    )
    .all(target) as unknown as User[];

  if (rows.length === 0) return 0;

  const baseUrl = await getBaseUrl();
  const results = await Promise.all(
    rows.map((user) =>
      sendRenewalNoticeEmail({
        user,
        paidThrough: target,
        days,
        baseUrl,
        dedupeKey: `renewal:${user.id}:${day}`,
      }),
    ),
  );

  const admin = getAdmin();
  if (admin) {
    await sendRenewalAdminEmail({
      admin,
      rows: rows.map((user) => ({ name: user.name, email: user.email, paidThrough: target })),
      days,
      baseUrl,
      day,
    });
  }

  return results.filter((result) => result.status === "sent").length;
}

export async function sendAdminDigest(day: string): Promise<boolean> {
  const admin = getAdmin();
  if (!admin) return false;

  const open = openInvoices();
  const baseUrl = await getBaseUrl();
  const collectedRow = db()
    .prepare("SELECT COALESCE(SUM(amount_usd),0) AS total FROM invoices WHERE status = 'paid'")
    .get() as { total: number };
  const outstanding = open.reduce((sum, row) => sum + row.amount_usd, 0);
  const removals = removalCandidates(day);

  const result = await sendDigestEmail({
    admin,
    baseUrl,
    rows: open.map((row) => ({
      name: row.user_name,
      email: row.user_email,
      status: row.status,
      amount: row.amount_usd,
      due: row.due_date,
      invoiceId: row.id,
    })),
    removals: removals.map((row) => ({
      name: row.user_name,
      email: row.user_email,
      due: row.due_date,
    })),
    collected: Number(collectedRow.total),
    outstanding,
    seatsUsed: seatsUsed(),
    seats: seatCapacity(),
  });

  return result.status === "sent";
}

export interface DailyResult {
  day: string;
  overdueMarked: number;
  remindersSent: number;
  renewalNotices: number;
  digestSent: boolean;
  fxRefreshed: boolean;
  storage?: { over: number; sent: number };
}

const schedulerState = globalThis as unknown as { __a1JobsRunning?: boolean };

export async function runDailyJobs(options: { skipEmail?: boolean } = {}): Promise<DailyResult> {
  const settings = getSettings();
  const day = today(settings.plan.timezone);

  if (schedulerState.__a1JobsRunning) {
    return { day, overdueMarked: 0, remindersSent: 0, renewalNotices: 0, digestSent: false, fxRefreshed: false };
  }
  schedulerState.__a1JobsRunning = true;
  try {
    const overdueMarked = markOverdue(day);

    let fxRefreshed = false;
    if (settings.fx.provider !== "manual") {
      const stored = latestStoredRate();
      if (!stored || stored.date < day) {
        try {
          await refreshRate();
          fxRefreshed = true;
        } catch {
          /* keep the last known rate */
        }
      }
    }

    let remindersSent = 0;
    let digestSent = false;
    let renewalNotices = 0;
    if (!options.skipEmail && settings.reminders.enabled) {
      remindersSent = await sendDueReminders(day);
      renewalNotices = await sendRenewalNotices(day);
      if (settings.reminders.adminDigest) digestSent = await sendAdminDigest(day);
    }

    let storage: { over: number; sent: number } | undefined;
    if (!options.skipEmail) {
      try {
        storage = await checkStorage(day);
      } catch {
        /* storage alerts are best-effort */
      }
    }

    return { day, overdueMarked, remindersSent, renewalNotices, digestSent, fxRefreshed, storage };
  } finally {
    schedulerState.__a1JobsRunning = false;
  }
}

/** Human-readable list of members who are past grace and should be removed. */
export function removalCandidates(day = today(getSettings().plan.timezone)) {
  const cutoff = addDays(day, -getSettings().plan.graceDays);
  return db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email, u.status AS user_status
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE i.status = 'overdue' AND i.due_date < ? AND u.status = 'active'
       ORDER BY i.due_date ASC`,
    )
    .all(cutoff) as unknown as InvoiceWithUser[];
}

export function reminderPreview(invoice: Invoice): string {
  return `${formatDate(invoice.due_date)} · ${formatMoney(invoice.amount_usd)}`;
}
