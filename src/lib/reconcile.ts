import "server-only";
import { db, newId, nowIso, event } from "./db";
import { normalizeReference, REFERENCE_PATTERN } from "./pricing";
import { getSettings } from "./settings";
import { markInvoicePaid } from "./billing";
import type { Invoice, PaymentMethod } from "./types";

export interface IngestPayload {
  reference?: string;
  amount: number;
  currency: "USD" | "CNY";
  method: PaymentMethod;
  txRef?: string;
  paidAt?: string;
  payer?: string;
  note?: string;
}

export interface IngestResult {
  ok: boolean;
  matched: boolean;
  invoiceId?: string;
  status: "paid" | "review" | "unmatched" | "duplicate" | "error";
  message: string;
}

const METHODS: PaymentMethod[] = ["wechat", "alipay", "venmo", "zelle"];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && METHODS.includes(value as PaymentMethod);
}

/**
 * Record an incoming payment and try to match it to an open invoice by its
 * reference code. Runs when `autoVerify` is on and the amount is within
 * tolerance; otherwise the payment is queued for admin review.
 */
export function ingestPayment(payload: IngestPayload): IngestResult {
  const settings = getSettings();
  if (!payload.reference) {
    return { ok: false, matched: false, status: "unmatched", message: "A payment reference is required." };
  }
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { ok: false, matched: false, status: "error", message: "Amount must be greater than zero." };
  }

  const reference = normalizeReference(payload.reference);
  const invoice = db()
    .prepare("SELECT * FROM invoices WHERE upper(reference) = ?")
    .get(reference) as unknown as Invoice | undefined;

  if (!invoice) {
    event("ingest", "payment.unmatched", { reference, amount: payload.amount, currency: payload.currency });
    return {
      ok: false,
      matched: false,
      status: "unmatched",
      message: `No invoice found for reference ${reference}.`,
    };
  }

  if (invoice.status === "paid") {
    return {
      ok: true,
      matched: true,
      invoiceId: invoice.id,
      status: "duplicate",
      message: "This invoice is already paid.",
    };
  }
  if (invoice.status === "void") {
    return {
      ok: false,
      matched: true,
      invoiceId: invoice.id,
      status: "error",
      message: "This invoice was voided.",
    };
  }

  if (payload.txRef) {
    const seen = db()
      .prepare("SELECT status FROM payments WHERE tx_ref = ?")
      .get(payload.txRef) as { status: string } | undefined;
    if (seen) {
      return {
        ok: true,
        matched: true,
        invoiceId: invoice.id,
        status: seen.status === "pending" ? "review" : "duplicate",
        message:
          seen.status === "pending"
            ? "A matching payment report is already pending review; approve it in the admin console."
            : "This transaction was already recorded.",
      };
    }
  }

  const amountUsd =
    payload.currency === "CNY"
      ? Math.round((payload.amount / (invoice.fx_rate || 1)) * 100) / 100
      : payload.amount;

  const tolerance = settings.automation.toleranceUsd;
  const settles = amountUsd + tolerance >= invoice.amount_usd;

  if (settings.automation.autoVerify && settles) {
    markInvoicePaid({
      invoiceId: invoice.id,
      method: payload.method,
      amount: payload.amount,
      currency: payload.currency,
      txRef: payload.txRef ?? null,
      source: "ingest",
      actor: null,
      note: payload.note ?? payload.payer ?? null,
      raw: payload,
    });
    return {
      ok: true,
      matched: true,
      invoiceId: invoice.id,
      status: "paid",
      message: `Payment matched ${invoice.reference} and the invoice is marked paid.`,
    };
  }

  // Partial or unexpected amount: keep it as a pending payment for the admin.
  db()
    .prepare(
      `INSERT INTO payments (id, invoice_id, method, currency, amount, amount_usd, fx_rate, fx_date, tx_ref, source, raw, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ingest', ?, 'pending', ?)`,
    )
    .run(
      newId(),
      invoice.id,
      payload.method,
      payload.currency,
      payload.amount,
      amountUsd,
      invoice.fx_rate,
      invoice.fx_date,
      payload.txRef ?? null,
      JSON.stringify(payload),
      nowIso(),
    );

  event("ingest", "payment.needs_review", {
    invoiceId: invoice.id,
    amountUsd,
    expected: invoice.amount_usd,
  });

  return {
    ok: true,
    matched: true,
    invoiceId: invoice.id,
    status: "review",
    message: `Payment matched ${invoice.reference} but needs review (received ${amountUsd.toFixed(2)} USD, expected ${invoice.amount_usd.toFixed(2)} USD).`,
  };
}

function guessMethod(text: string): PaymentMethod {
  const value = text.toLowerCase();
  if (/wechat|weixin|微信/.test(value)) return "wechat";
  if (/alipay|支付宝/.test(value)) return "alipay";
  if (/venmo/.test(value)) return "venmo";
  return "zelle";
}

function guessAmount(text: string): { amount: number; currency: "USD" | "CNY" } | null {
  const cny = text.match(/(?:CNY|RMB|¥|￥)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (cny) return { amount: Number(cny[1].replace(/,/g, "")), currency: "CNY" };

  const usd = text.match(/(?:USD|\$)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (usd) return { amount: Number(usd[1].replace(/,/g, "")), currency: "USD" };

  return null;
}

/**
 * Optional IMAP reconciliation. Watches an inbox (e.g. a mailbox that receives
 * payment notifications) for unread messages containing an invoice reference.
 * Best-effort: verify your bank/provider notification format before enabling.
 */
export async function pollImap(): Promise<{ scanned: number; matched: number }> {
  const { imap, automation } = getSettings();
  if (!automation.imapEnabled || !imap.host || !imap.user || !imap.pass) {
    return { scanned: 0, matched: 0 };
  }

  const { ImapFlow } = await import("imapflow");
  const { simpleParser } = await import("mailparser");

  const allowedSenders = (imap.allowedSenders || "")
    .split(/[,\n]/)
    .map((value: string) => value.trim().toLowerCase())
    .filter(Boolean);
  if (allowedSenders.length === 0) {
    event("imap", "poll.skipped", { reason: "no allowed senders configured" });
    return { scanned: 0, matched: 0 };
  }

  const client = new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: imap.pass },
    logger: false,
  });

  let scanned = 0;
  let matched = 0;

  await client.connect();
  const lock = await client.getMailboxLock(imap.mailbox || "INBOX");
  try {
    const since = new Date(Date.now() - 3 * 86_400_000);
    const uids = await client.search({ since, seen: false }, { uid: true });
    const list = Array.isArray(uids) ? uids.slice(-25) : [];

    for (const uid of list) {
      const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
      if (!message || !message.source) continue;
      scanned += 1;

      const parsed = await simpleParser(message.source);
      const from = (parsed.from?.text || "").toLowerCase();
      if (!allowedSenders.some((sender: string) => from.includes(sender))) continue;

      const text = `${parsed.subject || ""}\n${parsed.text || ""}`;
      const references = new Set(
        (text.match(REFERENCE_PATTERN) || []).map((value) => normalizeReference(value)),
      );
      const amount = guessAmount(text);

      // One email must identify exactly one invoice; otherwise skip it and
      // leave it unread so a human can look at it.
      if (references.size === 1 && amount && amount.amount > 0) {
        const reference = [...references][0];
        const result = ingestPayment({
          reference,
          amount: amount.amount,
          currency: amount.currency,
          method: guessMethod(text),
          txRef: `imap-${uid}-${reference}`,
          note: parsed.subject || undefined,
        });
        if (result.status === "paid") matched += 1;
        await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }

  event("imap", "poll.completed", { scanned, matched });
  return { scanned, matched };
}
