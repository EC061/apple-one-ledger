import "server-only";
import { db } from "./db";
import { addDays, today } from "./dates";
import { getSettings } from "./settings";
import { latestStoredRate, refreshRate } from "./fx";
import { markOverdue } from "./billing";
import { sendAdminAdvanceEmail, sendLateKickEmail, sendReminderEmail, sendRenewalNoticeEmail } from "./email";
import { getBaseUrl } from "./url";
import { getAdmin } from "./auth";
import { checkStorage } from "./storage";
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
    status: row.user_status as User["status"],
    paid_through: null,
    note: null,
    storage_used_gb: 0,
    storage_updated_at: null,
    created_at: "",
    updated_at: "",
  };
}

/**
 * The single advance notice: everything due or expiring within N days.
 * One email per invoice to the member, one email per renewal to the member,
 * and one summary to the admin for the day.
 */
export async function sendAdvanceNotices(day: string): Promise<number> {
  const settings = getSettings();
  if (!settings.reminders.enabled) return 0;

  const horizon = addDays(day, Math.max(settings.reminders.advanceDays, 1));
  const baseUrl = await getBaseUrl();
  let sent = 0;

  const invoiceRows = db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email, u.status AS user_status
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE i.status = 'awaiting_payment' AND u.status = 'active'
         AND i.due_date BETWEEN ? AND ?
       ORDER BY i.due_date`,
    )
    .all(day, horizon) as unknown as InvoiceWithUser[];

  const invoiceResults = await Promise.all(
    invoiceRows.map(async (invoice) => {
      const result = await sendReminderEmail({
        user: asUser(invoice),
        invoice,
        baseUrl,
        kind: "reminder",
        dedupeKey: `advance-invoice:${invoice.id}`,
      });
      if (result.status !== "sent") return null;
      return {
        name: invoice.user_name,
        email: invoice.user_email,
        amount: invoice.amount_usd,
        due: invoice.due_date,
        reference: invoice.reference,
      };
    }),
  );
  const invoices = invoiceResults.filter((row): row is NonNullable<typeof row> => row !== null);
  sent += invoices.length;

  const renewalRows = db()
    .prepare(
      `SELECT u.* FROM users u
       WHERE u.status = 'active' AND u.paid_through BETWEEN ? AND ?
         AND NOT EXISTS (
           SELECT 1 FROM invoices i
           WHERE i.user_id = u.id AND i.status IN ('awaiting_payment','submitted','overdue')
         )
       ORDER BY u.paid_through`,
    )
    .all(day, horizon) as unknown as User[];

  const renewalResults = await Promise.all(
    renewalRows.map(async (user) => {
      if (!user.paid_through) return null;
      const result = await sendRenewalNoticeEmail({
        user,
        paidThrough: user.paid_through,
        days: settings.reminders.advanceDays,
        baseUrl,
        dedupeKey: `advance-renewal:${user.id}:${user.paid_through}`,
      });
      if (result.status !== "sent") return null;
      return { name: user.name, email: user.email, paidThrough: user.paid_through };
    }),
  );
  const renewals = renewalResults.filter((row): row is NonNullable<typeof row> => row !== null);
  sent += renewals.length;

  const admin = getAdmin();
  if (admin && (invoices.length || renewals.length)) {
    await sendAdminAdvanceEmail({
      admin,
      invoices,
      renewals,
      days: settings.reminders.advanceDays,
      baseUrl,
      day,
    });
  }

  return sent;
}

/**
 * One day past due: email the admin for each seat to kick. Members are not
 * emailed again. Deduped per invoice, so it is sent once.
 */
export async function sendLateKickNotices(day: string): Promise<number> {
  const settings = getSettings();
  if (!settings.reminders.enabled) return 0;

  const cutoff = addDays(day, -Math.max(settings.reminders.lateDays, 1));
  const admin = getAdmin();
  if (!admin) return 0;

  const rows = db()
    .prepare(
      `SELECT i.*, u.name AS user_name, u.email AS user_email, u.status AS user_status
       FROM invoices i JOIN users u ON u.id = i.user_id
       WHERE i.status IN ('awaiting_payment','overdue') AND u.status = 'active' AND i.due_date <= ?
       ORDER BY i.due_date`,
    )
    .all(cutoff) as unknown as InvoiceWithUser[];

  const baseUrl = await getBaseUrl();
  const results = await Promise.all(
    rows.map((invoice) =>
      sendLateKickEmail({
        admin,
        member: { name: invoice.user_name, email: invoice.user_email },
        invoice,
        days: settings.reminders.lateDays,
        baseUrl,
        day,
      }),
    ),
  );

  return results.filter((result) => result.status === "sent").length;
}

export interface DailyResult {
  day: string;
  overdueMarked: number;
  advanceSent: number;
  lateSent: number;
  fxRefreshed: boolean;
  storage?: { over: number; sent: number };
}

const schedulerState = globalThis as unknown as { __a1JobsRunning?: boolean };

export async function runDailyJobs(options: { skipEmail?: boolean } = {}): Promise<DailyResult> {
  const settings = getSettings();
  const day = today(settings.plan.timezone);

  if (schedulerState.__a1JobsRunning) {
    return { day, overdueMarked: 0, advanceSent: 0, lateSent: 0, fxRefreshed: false };
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

    let advanceSent = 0;
    let lateSent = 0;
    if (!options.skipEmail && settings.reminders.enabled) {
      advanceSent = await sendAdvanceNotices(day);
      lateSent = await sendLateKickNotices(day);
    }

    let storage: { over: number; sent: number } | undefined;
    if (!options.skipEmail) {
      try {
        storage = await checkStorage(day);
      } catch {
        /* storage alerts are best-effort */
      }
    }

    return { day, overdueMarked, advanceSent, lateSent, fxRefreshed, storage };
  } finally {
    schedulerState.__a1JobsRunning = false;
  }
}

/** Members past grace: the admin UI and digest use this to show who to remove. */
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
