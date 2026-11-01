"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, newId, nowIso, event } from "@/lib/db";
import {
  generateCode,
  hashAccessCode,
  requireAdmin,
  revokeUserSessions,
} from "@/lib/auth";
import {
  BillingError,
  confirmExistingPayment,
  createInvoice,
  markInvoicePaid,
  openInvoiceFor,
  refreshPaidThrough,
  voidInvoice,
} from "@/lib/billing";
import { getCurrentRate, refreshRate } from "@/lib/fx";
import { getSettings, saveSection } from "@/lib/settings";
import { isPlan } from "@/lib/pricing";
import { isPaymentMethod } from "@/lib/labels";
import {
  sendMail,
  sendInviteEmail,
  sendReceiptEmail,
  sendReceiptForInvoice,
  sendReminderEmail,
  verifySmtp,
  smtpConfigured,
} from "@/lib/email";
import { runDailyJobs, sendAdminDigest } from "@/lib/reminders";
import { updateStorage } from "@/lib/storage";
import { getBaseUrl } from "@/lib/url";
import { setAccessCodeFlash } from "@/lib/flash";
import { addDays, today } from "@/lib/dates";
import type { Invoice, Payment, User } from "@/lib/types";

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function number(data: FormData, key: string, fallback: number): number {
  const raw = text(data, key).replace(/,/g, "");
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function flag(data: FormData, key: string): boolean {
  const value = data.get(key);
  return value === "on" || value === "true" || value === "1";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function refreshAll() {
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/admin");
  revalidatePath("/admin/members");
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/invites");
  revalidatePath("/admin/settings");
}

/* ------------------------------------------------------------------ */
/* Settings                                                           */
/* ------------------------------------------------------------------ */

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const intent = text(formData, "intent");
  const current = getSettings();

  if (intent === "plan") {
    const tzRaw = text(formData, "timezone") || current.plan.timezone;
    let timezone = "UTC";
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: tzRaw });
      timezone = tzRaw;
    } catch {
      timezone = current.plan.timezone;
    }

    saveSection("plan", {
      name: text(formData, "name") || current.plan.name,
      timezone,
      seats: Math.round(clamp(number(formData, "seats", current.plan.seats), 2, 12)),
      graceDays: Math.round(clamp(number(formData, "graceDays", current.plan.graceDays), 0, 90)),
      dueSoonDays: Math.round(clamp(number(formData, "dueSoonDays", current.plan.dueSoonDays), 1, 60)),
      services: text(formData, "services")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 20),
    });

    saveSection("pricing", {
      monthlyTotalUsd: Math.max(number(formData, "monthlyTotalUsd", current.pricing.monthlyTotalUsd), 0),
      firstTerm: {
        quarterly: Math.max(number(formData, "first_quarterly", current.pricing.firstTerm.quarterly), 0),
        semiannual: Math.max(number(formData, "first_semiannual", current.pricing.firstTerm.semiannual), 0),
        annual: Math.max(number(formData, "first_annual", current.pricing.firstTerm.annual), 0),
      },
      renewal: {
        quarterly: Math.max(number(formData, "renew_quarterly", current.pricing.renewal.quarterly), 0),
        semiannual: Math.max(number(formData, "renew_semiannual", current.pricing.renewal.semiannual), 0),
        annual: Math.max(number(formData, "renew_annual", current.pricing.renewal.annual), 0),
      },
    });
  }

  if (intent === "payments") {
    saveSection("payments", {
      venmoHandle: text(formData, "venmoHandle").replace(/^@/, ""),
      zelleEmail: text(formData, "zelleEmail"),
      wechatId: text(formData, "wechatId"),
      alipayId: text(formData, "alipayId"),
      wechatQrUrl: text(formData, "wechatQrUrl"),
      alipayQrUrl: text(formData, "alipayQrUrl"),
      instructions: text(formData, "instructions").slice(0, 2000),
    });
  }

  if (intent === "smtp") {
    saveSection("smtp", {
      enabled: flag(formData, "enabled"),
      host: text(formData, "host"),
      port: Math.round(clamp(number(formData, "port", 587), 1, 65535)),
      secure: flag(formData, "secure"),
      user: text(formData, "user"),
      pass: text(formData, "pass") || current.smtp.pass,
      from: text(formData, "from"),
    });
  }

  if (intent === "fx") {
    const provider = text(formData, "provider") === "manual" ? "manual" : "frankfurter";
    const manual = number(formData, "manualRate", 0);
    saveSection("fx", {
      provider,
      manualRate: manual > 0 ? manual : null,
      lastRefresh: current.fx.lastRefresh,
    });
  }

  if (intent === "reminders") {
    const days = text(formData, "daysBefore")
      .split(/[,\s]+/)
      .map((value) => Math.round(Number(value)))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 60);
    saveSection("reminders", {
      enabled: flag(formData, "enabled"),
      daysBefore: days.length ? Array.from(new Set(days)).sort((a, b) => b - a) : current.reminders.daysBefore,
      overdueEveryDays: Math.round(clamp(number(formData, "overdueEveryDays", 3), 1, 30)),
      adminDigest: flag(formData, "adminDigest"),
      removalWarningDays: Math.round(clamp(number(formData, "removalWarningDays", 7), 1, 60)),
    });
  }

  if (intent === "app") {
    saveSection("app", {
      sessionDays: Math.round(clamp(number(formData, "sessionDays", current.app.sessionDays), 1, 365)),
      schedulerHours: Math.round(clamp(number(formData, "schedulerHours", current.app.schedulerHours), 1, 168)),
      paymentToleranceUsd: clamp(number(formData, "paymentToleranceUsd", current.app.paymentToleranceUsd), 0, 100),
    });
  }

  if (intent === "storage") {
    saveSection("storage", {
      enabled: flag(formData, "enabled"),
      totalGb: Math.max(number(formData, "totalGb", current.storage.totalGb), 1),
      shareCount: Math.round(clamp(number(formData, "shareCount", current.storage.shareCount), 1, 12)),
      warnPercent: clamp(number(formData, "warnPercent", 90), 50, 100),
      maxAgeDays: Math.round(clamp(number(formData, "maxAgeDays", current.storage.maxAgeDays), 7, 365)),
      notifyMember: flag(formData, "notifyMember"),
      notifyAdmin: flag(formData, "notifyAdmin"),
    });
  }

  event(null, "settings.saved", { intent });
  refreshAll();
  redirect(`/admin/settings?saved=${intent}`);
}

export async function testSmtpAction(formData: FormData) {
  await requireAdmin();
  const to = text(formData, "to");
  if (!smtpConfigured()) redirect("/admin/settings?error=smtp");

  const check = await verifySmtp();
  if (!check.ok) {
    redirect(`/admin/settings?error=${encodeURIComponent(check.error || "SMTP verification failed")}`);
  }

  const result = await sendMail({
    to,
    subject: "SMTP test — Apple One family ledger",
    text: "Your SMTP settings work. Payment reminders and receipts will be delivered.",
    html: "<p>Your SMTP settings work. Payment reminders and receipts will be delivered.</p>",
    kind: "smtp-test",
  });
  redirect(
    result.ok
      ? `/admin/settings?saved=smtp-test`
      : `/admin/settings?error=${encodeURIComponent(result.error || "Send failed")}`,
  );
}

export async function refreshFxAction() {
  await requireAdmin();
  try {
    await refreshRate();
  } catch (error) {
    redirect(`/admin/settings?error=${encodeURIComponent((error as Error).message)}`);
  }
  refreshAll();
  redirect("/admin/settings?saved=fx-refresh");
}

/* ------------------------------------------------------------------ */
/* Invites                                                            */
/* ------------------------------------------------------------------ */

export async function createInviteAction(formData: FormData) {
  await requireAdmin();
  const label = text(formData, "label").slice(0, 80);
  const email = text(formData, "email").toLowerCase();
  const days = Math.round(clamp(number(formData, "expiresDays", 14), 1, 365));
  const expiresAt = addDays(today(getSettings().plan.timezone), days);

  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/admin/invites?error=email");

  let code = generateCode(2, 5);
  for (let i = 0; i < 5; i++) {
    if (!db().prepare("SELECT 1 FROM invites WHERE code = ?").get(code)) break;
    code = generateCode(2, 5);
  }

  db()
    .prepare("INSERT INTO invites (code, label, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(code, label || null, nowIso(), expiresAt);

  event(null, "invite.created", { code, label });

  if (email) {
    const baseUrl = await getBaseUrl();
    await sendInviteEmail({ to: email, url: `${baseUrl}/join/${code}`, expiresAt }).catch(() => undefined);
    event(null, "invite.emailed", { code, email });
  }

  revalidatePath("/admin/invites");
  redirect("/admin/invites?created=1");
}

export async function revokeInviteAction(formData: FormData) {
  await requireAdmin();
  const code = text(formData, "code");
  db().prepare("UPDATE invites SET revoked_at = ? WHERE code = ? AND used_at IS NULL").run(nowIso(), code);
  event(null, "invite.revoked", { code });
  revalidatePath("/admin/invites");
  redirect("/admin/invites");
}

/* ------------------------------------------------------------------ */
/* Members                                                            */
/* ------------------------------------------------------------------ */

export async function createMemberAction(formData: FormData) {
  await requireAdmin();
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const note = text(formData, "note");

  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/admin/members?error=invalid");
  }

  const settings = getSettings();
  const used = db().prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'").get() as { n: number };
  if (Number(used.n) >= settings.plan.seats) redirect("/admin/members?error=full");

  const clash = db().prepare("SELECT 1 FROM users WHERE lower(email) = ?").get(email);
  if (clash) redirect("/admin/members?error=exists");

  const code = generateCode();
  const id = newId();
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO users (id, role, name, email, access_code_hash, status, note, created_at, updated_at)
       VALUES (?, 'member', ?, ?, ?, 'active', ?, ?, ?)`,
    )
    .run(id, name, email, hashAccessCode(code), note || null, now, now);

  await setAccessCodeFlash(code);
  event(null, "member.created", { id, email });
  refreshAll();
  redirect("/admin/members?created=1");
}

export async function resetMemberCodeAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User | undefined;
  if (!user) redirect("/admin/members?error=missing");

  const code = generateCode();
  db().prepare("UPDATE users SET access_code_hash = ?, updated_at = ? WHERE id = ?").run(
    hashAccessCode(code),
    nowIso(),
    userId,
  );
  await revokeUserSessions(userId);
  await setAccessCodeFlash(code);
  event(null, "member.code_reset", { userId });
  revalidatePath("/admin/members");
  redirect("/admin/members?reset=1");
}

export async function updateMemberAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const note = text(formData, "note");

  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect("/admin/members?error=invalid");
  }
  const clash = db()
    .prepare("SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?")
    .get(email, userId);
  if (clash) redirect("/admin/members?error=exists");

  db()
    .prepare("UPDATE users SET name = ?, email = ?, note = ?, updated_at = ? WHERE id = ?")
    .run(name, email, note || null, nowIso(), userId);
  event(null, "member.updated", { userId });
  refreshAll();
  redirect("/admin/members?saved=1");
}

export async function updateMemberStorageAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const usedGb = number(formData, "usedGb", -1);
  if (usedGb < 0) redirect("/admin/members?error=storage");
  try {
    updateStorage(userId, usedGb, "admin", "admin");
  } catch (error) {
    redirect(`/admin/members?error=${encodeURIComponent((error as Error).message)}`);
  }
  revalidatePath("/admin/members");
  revalidatePath("/admin");
  redirect("/admin/members?saved=storage");
}

export async function setMemberStatusAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const status = text(formData, "status") === "removed" ? "removed" : "active";

  const target = db().prepare("SELECT role FROM users WHERE id = ?").get(userId) as { role: string } | undefined;
  if (!target) redirect("/admin/members?error=missing");
  if (target.role === "admin") redirect("/admin/members?error=admin");

  if (status === "removed") {
    db()
      .prepare(
        "UPDATE invoices SET status = 'void', voided_at = ? WHERE user_id = ? AND status IN ('awaiting_payment','submitted','overdue')",
      )
      .run(nowIso(), userId);
    await revokeUserSessions(userId);
  }

  db().prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), userId);
  refreshPaidThrough(userId);
  event(null, "member.status", { userId, status });
  refreshAll();
  redirect("/admin/members");
}

export async function setPaidThroughAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const value = text(formData, "paidThrough");
  if (value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    const valid =
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value;
    if (!valid) redirect("/admin/members?error=date");
  }

  db()
    .prepare("UPDATE users SET paid_through = ?, updated_at = ? WHERE id = ?")
    .run(value || null, nowIso(), userId);
  event(null, "member.paid_through", { userId, value });
  refreshAll();
  redirect("/admin/members?saved=1");
}

/* ------------------------------------------------------------------ */
/* Invoices                                                           */
/* ------------------------------------------------------------------ */

export async function adminCreateInvoiceAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const plan = text(formData, "plan");
  if (!isPlan(plan)) redirect("/admin/invoices?error=plan");
  if (openInvoiceFor(userId)) redirect("/admin/invoices?error=open");

  const rate = await getCurrentRate().catch(() => null);
  if (!rate || rate.source === "fallback") redirect("/admin/invoices?error=fx");

  let id: string;
  try {
    id = createInvoice({ userId, plan, fxRate: rate.rate, fxDate: rate.date, actor: null }).id;
  } catch (error) {
    const message = error instanceof BillingError ? error.message : "Could not create invoice.";
    redirect(`/admin/invoices?error=${encodeURIComponent(message)}`);
  }

  event(null, "invoice.admin_created", { invoiceId: id });
  refreshAll();
  redirect(`/admin/invoices?created=${id}`);
}

export async function adminMarkPaidAction(formData: FormData) {
  await requireAdmin();
  const invoiceId = text(formData, "invoiceId");
  const method = text(formData, "method");
  const currency = text(formData, "currency") === "CNY" ? "CNY" : "USD";
  let value = number(formData, "amount", 0);
  const txRef = text(formData, "txRef");
  const note = text(formData, "note");

  if (!isPaymentMethod(method) || value <= 0) redirect("/admin/invoices?error=input");

  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as unknown as Invoice | undefined;
  if (!invoice) redirect("/admin/invoices?error=missing");

  // The form seeds the USD amount; if the admin switched to CNY without
  // editing the field, use the invoice's locked CNY figure.
  if (currency === "CNY" && value === invoice.amount_usd) value = invoice.amount_cny;

  try {
    markInvoicePaid({
      invoiceId,
      method,
      amount: value,
      currency,
      txRef: txRef || null,
      source: "admin",
      actor: "admin",
      note: note || null,
      allowPartial: flag(formData, "partial"),
    });
  } catch (error) {
    const message = error instanceof BillingError ? error.message : "Could not mark the invoice paid.";
    redirect(`/admin/invoices?error=${encodeURIComponent(message)}`);
  }

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(invoice.user_id) as unknown as User | undefined;
  if (user) {
    const updated = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as unknown as Invoice;
    await sendReceiptEmail({ user, invoice: updated, baseUrl: await getBaseUrl() }).catch(() => undefined);
  }

  refreshAll();
  redirect("/admin/invoices?saved=paid");
}

export async function adminVoidInvoiceAction(formData: FormData) {
  await requireAdmin();
  const invoiceId = text(formData, "invoiceId");
  try {
    voidInvoice(invoiceId, "admin");
  } catch (error) {
    redirect(`/admin/invoices?error=${encodeURIComponent((error as Error).message)}`);
  }
  refreshAll();
  redirect("/admin/invoices?saved=void");
}

export async function adminSendReminderAction(formData: FormData) {
  await requireAdmin();
  const invoiceId = text(formData, "invoiceId");
  const kind = text(formData, "kind") === "overdue" ? "overdue" : "reminder";

  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as unknown as Invoice | undefined;
  if (!invoice) redirect("/admin/invoices?error=missing");
  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(invoice.user_id) as unknown as User | undefined;
  if (!user) redirect("/admin/invoices?error=missing");

  const result = await sendReminderEmail({ user, invoice, baseUrl: await getBaseUrl(), kind });
  event(null, "reminder.manual", { invoiceId, status: result.status });
  redirect(`/admin/invoices?saved=${result.status}`);
}

export async function runJobsAction() {
  await requireAdmin();
  const result = await runDailyJobs();
  event(null, "jobs.manual", result);
  refreshAll();
  redirect(`/admin?ran=${result.remindersSent}&digest=${result.digestSent ? 1 : 0}`);
}

export async function sendDigestNowAction() {
  await requireAdmin();
  const sent = await sendAdminDigest(today(getSettings().plan.timezone));
  event(null, "digest.manual", { sent });
  redirect(`/admin?saved=${sent ? "digest" : "digest-skipped"}`);
}

/* ------------------------------------------------------------------ */
/* Pending payments from automatic matching                           */
/* ------------------------------------------------------------------ */

export async function approvePaymentAction(formData: FormData) {
  await requireAdmin();
  const paymentId = text(formData, "paymentId");
  const payment = db().prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) as unknown as Payment | undefined;
  if (!payment || payment.status !== "pending") redirect("/admin/invoices?error=payment");

  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(payment.invoice_id) as unknown as Invoice;
  try {
    confirmExistingPayment(paymentId, "admin", flag(formData, "partial"));
  } catch (error) {
    redirect(`/admin/invoices?error=${encodeURIComponent((error as Error).message)}`);
  }
  await sendReceiptForInvoice(invoice.id);
  refreshAll();
  redirect("/admin/invoices?saved=approved");
}

export async function rejectPaymentAction(formData: FormData) {
  await requireAdmin();
  const paymentId = text(formData, "paymentId");
  const payment = db().prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) as unknown as Payment | undefined;
  if (!payment || payment.status !== "pending") redirect("/admin/invoices?error=payment");

  const day = today(getSettings().plan.timezone);
  db().prepare("UPDATE payments SET status = 'rejected' WHERE id = ? AND status = 'pending'").run(paymentId);

  // A rejected member report must not leave the invoice stuck in `submitted`.
  const remaining = db()
    .prepare("SELECT COUNT(*) AS n FROM payments WHERE invoice_id = ? AND status = 'pending'")
    .get(payment.invoice_id) as { n: number };
  if (Number(remaining.n) === 0) {
    const invoice = db()
      .prepare("SELECT * FROM invoices WHERE id = ?")
      .get(payment.invoice_id) as unknown as Invoice | undefined;
    if (invoice && invoice.status === "submitted") {
      db()
        .prepare("UPDATE invoices SET status = ?, submitted_at = NULL WHERE id = ? AND status = 'submitted'")
        .run(invoice.due_date < day ? "overdue" : "awaiting_payment", invoice.id);
    }
  }

  event(null, "payment.rejected", { paymentId });
  revalidatePath("/admin/invoices");
  redirect("/admin/invoices?saved=rejected");
}
