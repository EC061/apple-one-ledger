import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { db, newId, nowIso } from "./db";
import { getSettings } from "./settings";
import { formatDate, formatMoney, today } from "./dates";
import { getBaseUrl } from "./url";
import type { Invoice, User } from "./types";

export interface SendResult {
  ok: boolean;
  status: "sent" | "skipped" | "failed" | "duplicate";
  error?: string;
}

let cachedTransport: { key: string; transport: Transporter } | null = null;

function transport(): Transporter | null {
  const { smtp } = getSettings();
  if (!smtp.enabled || !smtp.host || !smtp.fromEmail) return null;

  const key = JSON.stringify([
    smtp.host,
    smtp.port,
    smtp.secure,
    smtp.user,
    smtp.pass,
    smtp.fromName,
    smtp.fromEmail,
  ]);
  if (cachedTransport?.key === key) return cachedTransport.transport;

  const instance = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  cachedTransport = { key, transport: instance };
  return instance;
}

export function smtpConfigured(): boolean {
  const { smtp } = getSettings();
  return Boolean(smtp.enabled && smtp.host && smtp.fromEmail);
}

export async function verifySmtp(): Promise<{ ok: boolean; error?: string }> {
  const t = transport();
  if (!t) return { ok: false, error: "SMTP is disabled or incomplete (host, from required)." };
  try {
    await t.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  kind: string;
  dedupeKey?: string;
}): Promise<SendResult> {
  const id = newId();
  const createdAt = nowIso();

  // Claim the dedupe key atomically before sending. A concurrent run loses the
  // unique insert and is treated as a duplicate instead of double-sending.
  if (input.dedupeKey) {
    try {
      db()
        .prepare(
          "INSERT INTO emails (id, to_addr, subject, kind, status, error, dedupe_key, created_at) VALUES (?, ?, ?, ?, 'sending', NULL, ?, ?)",
        )
        .run(id, input.to, input.subject, input.kind, input.dedupeKey, createdAt);
    } catch {
      return { ok: true, status: "duplicate" };
    }
  } else {
    db()
      .prepare(
        "INSERT INTO emails (id, to_addr, subject, kind, status, error, dedupe_key, created_at) VALUES (?, ?, ?, ?, 'sending', NULL, NULL, ?)",
      )
      .run(id, input.to, input.subject, input.kind, createdAt);
  }

  const t = transport();

  if (!t) {
    db().prepare("UPDATE emails SET status = 'skipped', error = ?, dedupe_key = NULL WHERE id = ?").run(
      "SMTP not configured",
      id,
    );
    return { ok: false, status: "skipped", error: "SMTP not configured" };
  }

  try {
    const { smtp } = getSettings();
    await t.sendMail({
      from: smtp.fromName.trim() ? `${smtp.fromName.trim()} <${smtp.fromEmail}>` : smtp.fromEmail,
      to: input.to,
      subject: input.subject.replace(/[\r\n]+/g, " "),
      text: input.text,
      html: input.html,
    });
    db().prepare("UPDATE emails SET status = 'sent' WHERE id = ?").run(id);
    return { ok: true, status: "sent" };
  } catch (error) {
    const message = (error as Error).message;
    db()
      .prepare("UPDATE emails SET status = 'failed', error = ?, dedupe_key = NULL WHERE id = ?")
      .run(message, id);
    return { ok: false, status: "failed", error: message };
  }
}

/* ------------------------------------------------------------------ */
/* Templates                                                          */
/* ------------------------------------------------------------------ */

const BRAND = "#0b7a5a";

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#12211c;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e3e8e5;overflow:hidden;">
      <tr><td style="padding:22px 28px;border-bottom:1px solid #eef2f0;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${BRAND};margin-right:8px;"></span>
        <strong style="font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:#41524a;">Apple One Family Ledger</strong>
      </td></tr>
      <tr><td style="padding:26px 28px;">
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;">${title}</h1>
        ${body}
      </td></tr>
      <tr><td style="padding:18px 28px;background:#fafbfa;border-top:1px solid #eef2f0;font-size:12px;color:#6b7c74;">
        ${footer}
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}


function p(text: string) {
  return `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#25352e;">${text}</p>`;
}

function button(url: string, label: string) {
  return `<p style="margin:22px 0;"><a href="${url}" style="background:${BRAND};color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-size:15px;font-weight:600;display:inline-block;">${label}</a></p>`;
}

function details(rows: [string, string][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 18px;font-size:14px;">
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:7px 0;color:#6b7c74;">${k}</td><td style="padding:7px 0;text-align:right;font-weight:600;color:#12211c;">${v}</td></tr>`,
      )
      .join("")}
  </table>`;
}

export async function sendInviteEmail(input: { to: string; url: string; expiresAt?: string | null }) {
  const settings = getSettings();
  const subject = `You're invited to share ${settings.plan.name}`;
  const text = [
    `You have been invited to join the ${settings.plan.name} family plan.`,
    ``,
    `Open this link to claim your seat: ${input.url}`,
    input.expiresAt ? `This invite expires on ${formatDate(input.expiresAt)}.` : "",
    ``,
    `You will choose your own login code when you join.`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = layout(
    "Your seat is ready",
    p(`You have been invited to share <strong>${esc(settings.plan.name)}</strong>.`) +
      p("Open the link below to claim your seat. You will set up your own login code on the next screen.") +
      button(input.url, "Claim my seat") +
      (input.expiresAt ? p(`This invite expires on <strong>${formatDate(input.expiresAt)}</strong>.`) : "") +
      p(`<span style="color:#6b7c74;font-size:13px;">If the button does not work, paste this URL into your browser:<br>${input.url}</span>`),
    "You received this because an admin added you to a shared family plan.",
  );
  return sendMail({ to: input.to, subject, text, html, kind: "invite" });
}

export async function sendReminderEmail(input: {
  user: User;
  invoice: Invoice;
  baseUrl: string;
  kind: "reminder" | "overdue";
  dedupeKey?: string;
}) {
  const { user, invoice, baseUrl } = input;
  const overdue = input.kind === "overdue";
  const subject = overdue
    ? `Overdue: ${formatMoney(invoice.amount_usd)} for ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`
    : `Payment due ${formatDate(invoice.due_date)}: ${formatMoney(invoice.amount_usd)}`;
  const url = `${baseUrl}/dashboard/pay/${invoice.id}`;

  const body =
    p(`Hi ${esc(user.name)},`) +
    p(
      overdue
        ? `Your payment for the term starting <strong>${formatDate(invoice.period_start)}</strong> is past due. Please settle it to keep your seat.`
        : `A payment is coming up. Your share for the term starting <strong>${formatDate(invoice.period_start)}</strong> is due on <strong>${formatDate(invoice.due_date)}</strong>.`,
    ) +
    details([
      ["Amount", formatMoney(invoice.amount_usd)],
      ["CNY reference (rate " + invoice.fx_rate.toFixed(4) + ")", "¥" + invoice.amount_cny.toFixed(2)],
      ["Term", `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`],
      ["Reference", invoice.reference],
    ]) +
    button(url, "View payment details") +
    p(`<span style="color:#6b7c74;font-size:13px;">Include the reference <strong>${invoice.reference}</strong> in your payment note so it can be matched automatically.</span>`);

  const text = [
    `Hi ${user.name},`,
    ``,
    overdue ? `Your payment is overdue.` : `Your payment is due on ${formatDate(invoice.due_date)}.`,
    `Amount: ${formatMoney(invoice.amount_usd)} (CNY reference ¥${invoice.amount_cny.toFixed(2)} at ${invoice.fx_rate.toFixed(4)})`,
    `Term: ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`,
    `Reference: ${invoice.reference}`,
    ``,
    `Pay here: ${url}`,
  ].join("\n");

  return sendMail({
    to: user.email,
    subject,
    text,
    html: layout(overdue ? "Payment overdue" : "Payment reminder", body, "You can update your contact details from the dashboard."),
    kind: input.kind,
    dedupeKey:
      input.dedupeKey ?? `${input.kind}:${invoice.id}:${today(getSettings().plan.timezone)}`,
  });
}


export async function sendReceiptEmail(input: { user: User; invoice: Invoice; baseUrl: string }) {
  const { user, invoice, baseUrl } = input;
  const subject = `Payment received: ${formatMoney(invoice.amount_usd)}`;
  const text = [
    `Hi ${user.name},`,
    ``,
    `We recorded your payment of ${formatMoney(invoice.amount_usd)}.`,
    `Coverage: ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`,
    `Reference: ${invoice.reference}`,
  ].join("\n");

  return sendMail({
    to: user.email,
    subject,
    text,
    html: layout(
      "Payment received",
      p(`Hi ${esc(user.name)},`) +
        p("Thanks — your payment has been recorded and your seat is covered for the term below.") +
        details([
          ["Amount", formatMoney(invoice.amount_usd)],
          ["Coverage", `${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`],
          ["Reference", invoice.reference],
        ]) +
        button(`${baseUrl}/dashboard`, "View dashboard"),
      "Keep this email as your receipt.",
    ),
    kind: "receipt",
    dedupeKey: `receipt:${invoice.id}`,
  });
}


/** Load an invoice + its member and send the receipt. Safe to call twice. */
export async function sendReceiptForInvoice(invoiceId: string) {
  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as Invoice | undefined;
  if (!invoice) return;
  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(invoice.user_id) as User | undefined;
  if (!user) return;
  await sendReceiptEmail({ user, invoice, baseUrl: await getBaseUrl() }).catch(() => undefined);
}

export async function sendRenewalNoticeEmail(input: {
  user: User;
  paidThrough: string;
  days: number;
  baseUrl: string;
  dedupeKey: string;
}) {
  const { user, paidThrough, days, baseUrl } = input;
  const subject = `Your plan coverage ends in ${days} days`;
  const text = [
    `Hi ${user.name},`,
    "",
    `Your seat is covered until ${formatDate(paidThrough)} — ${days} days from now.`,
    "Renew to keep the seat; an unpaid seat is flagged for removal once it lapses.",
    "",
    `${baseUrl}/dashboard`,
  ].join("\n");

  const html = layout(
    "Coverage ends soon",
    p(`Hi ${esc(user.name)},`) +
      p(
        `Your seat is covered until <strong>${formatDate(paidThrough)}</strong> — ${days} days from now.`,
      ) +
      p("Renew to keep the seat. An unpaid seat is flagged for removal once it lapses.") +
      button(`${baseUrl}/dashboard`, "Renew in the dashboard"),
    "You receive this because you hold a seat on the family plan.",
  );

  return sendMail({ to: user.email, subject, text, html, kind: "renewal-notice", dedupeKey: input.dedupeKey });
}



export async function sendAdminAdvanceEmail(input: {
  admin: User;
  invoices: { name: string; email: string; amount: number; due: string; reference: string }[];
  renewals: { name: string; email: string; paidThrough: string }[];
  days: number;
  baseUrl: string;
  day: string;
}) {
  const { admin, invoices, renewals, days, baseUrl } = input;
  const total = invoices.length + renewals.length;
  const subject = `Upcoming in ${days} days: ${total} item${total === 1 ? "" : "s"}`;
  const text = [
    `Due or expiring within ${days} days:`,
    "",
    ...invoices.map((row) => `Invoice ${row.reference}: ${row.name} <${row.email}> — ${formatMoney(row.amount)} due ${row.due}`),
    ...renewals.map((row) => `Renewal: ${row.name} <${row.email}> — coverage ends ${row.paidThrough}`),
    "",
    `${baseUrl}/admin/invoices`,
  ].join("\n");

  const invoiceTable = invoices.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:14px;">
        <tr style="text-align:left;color:#6b7c74;">
          <th style="padding:6px 4px;border-bottom:1px solid #eef2f0;">Invoice</th>
          <th style="padding:6px 4px;border-bottom:1px solid #eef2f0;text-align:right;">Amount</th>
          <th style="padding:6px 4px;border-bottom:1px solid #eef2f0;text-align:right;">Due</th>
        </tr>
        ${invoices
          .map(
            (row) =>
              `<tr><td style="padding:7px 4px;border-bottom:1px solid #f4f7f5;">${esc(row.name)}<br><span style="color:#6b7c74;font-size:12px;">${esc(row.email)} · ${row.reference}</span></td><td style="padding:7px 4px;border-bottom:1px solid #f4f7f5;text-align:right;">${formatMoney(row.amount)}</td><td style="padding:7px 4px;border-bottom:1px solid #f4f7f5;text-align:right;">${formatDate(row.due)}</td></tr>`,
          )
          .join("")}
      </table>`
    : "";

  const renewalTable = renewals.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr style="text-align:left;color:#6b7c74;">
          <th style="padding:6px 4px;border-bottom:1px solid #eef2f0;">Renewal</th>
          <th style="padding:6px 4px;border-bottom:1px solid #eef2f0;text-align:right;">Coverage ends</th>
        </tr>
        ${renewals
          .map(
            (row) =>
              `<tr><td style="padding:7px 4px;border-bottom:1px solid #f4f7f5;">${esc(row.name)}<br><span style="color:#6b7c74;font-size:12px;">${esc(row.email)}</span></td><td style="padding:7px 4px;border-bottom:1px solid #f4f7f5;text-align:right;">${formatDate(row.paidThrough)}</td></tr>`,
          )
          .join("")}
      </table>`
    : "";

  const html = layout(
    `Upcoming in ${days} days`,
    p(`The following payments or renewals are due within <strong>${days} days</strong>.`) +
      invoiceTable +
      renewalTable +
      button(`${baseUrl}/admin/invoices`, "Open invoices"),
    "One reminder per day when there is something in the advance window.",
  );

  return sendMail({
    to: admin.email,
    subject,
    text,
    html,
    kind: "admin-advance",
    dedupeKey: `advance-admin:${input.day}`,
  });
}

export async function sendLateKickEmail(input: {
  admin: User;
  member: { name: string; email: string };
  invoice: Invoice;
  days: number;
  baseUrl: string;
  day: string;
}) {
  const { admin, member, invoice, days, baseUrl } = input;
  const subject = `${member.name} is ${days} day${days === 1 ? "" : "s"} late — remove the seat?`;
  const text = [
    `${member.name} <${member.email}> is past due.`,
    `Invoice ${invoice.reference}: ${formatMoney(invoice.amount_usd)} due ${invoice.due_date}`,
    `Term ${invoice.period_start} – ${invoice.period_end}`,
    "",
    `Remove or contact: ${baseUrl}/admin/members`,
  ].join("\n");

  const html = layout(
    "Seat past due — remove?",
    p(`<strong>${esc(member.name)}</strong> is ${days} day${days === 1 ? "" : "s"} past the due date.`) +
      details([
        ["Amount", formatMoney(invoice.amount_usd)],
        ["Due", formatDate(invoice.due_date)],
        ["Reference", invoice.reference],
        ["Email", member.email],
      ]) +
      p("Remove the seat or contact them from the members page.") +
      button(`${baseUrl}/admin/members`, "Open members"),
    "Sent once per invoice, one day after the due date.",
  );

  return sendMail({
    to: admin.email,
    subject,
    text,
    html,
    kind: "admin-late",
    dedupeKey: `late-invoice:${invoice.id}`,
  });
}
