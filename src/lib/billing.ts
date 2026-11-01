import { db, newId, nowIso, tx, event } from "./db";
import { PLANS, newReference, priceFor } from "./pricing";
import { addDays, addMonths, today } from "./dates";
import { getSettings } from "./settings";
import type { Invoice, PaymentMethod, Plan, User } from "./types";

export class BillingError extends Error {}

export function openInvoiceFor(userId: string): Invoice | null {
  return (
    (db()
      .prepare(
        "SELECT * FROM invoices WHERE user_id = ? AND status IN ('awaiting_payment','submitted','overdue') ORDER BY created_at DESC LIMIT 1",
      )
      .get(userId) as unknown as Invoice | undefined) ?? null
  );
}

export function nextTermIndex(userId: string): number {
  const row = db()
    .prepare("SELECT COALESCE(MAX(term_index), 0) AS n FROM invoices WHERE user_id = ? AND status <> 'void'")
    .get(userId) as { n: number };
  return Number(row.n) + 1;
}

export interface CreateInvoiceInput {
  userId: string;
  plan: Plan;
  fxRate: number;
  fxDate: string;
  actor: string | null;
}

export function createInvoice(input: CreateInvoiceInput): Invoice {
  const settings = getSettings();
  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(input.userId) as unknown as User | undefined;
  if (!user) throw new BillingError("Member not found.");
  if (user.status !== "active") throw new BillingError("This member is no longer active.");

  return tx(() => {
    if (openInvoiceFor(user.id)) {
      throw new BillingError("There is already an open invoice for this member.");
    }

    const termIndex = nextTermIndex(user.id);
    const months = PLANS[input.plan].months;
    const amountUsd = priceFor(input.plan, termIndex, settings.pricing);
    const rate = input.fxRate > 0 ? input.fxRate : 1;
    const amountCny = Math.round(amountUsd * rate * 100) / 100;

    // Coverage starts the day after the current paid-through date, or today.
    const current = today(settings.plan.timezone);
    const startBase = user.paid_through && user.paid_through >= current ? addDays(user.paid_through, 1) : current;
    const periodStart = startBase;
    const periodEnd = addDays(addMonths(periodStart, months), -1);

    let reference = newReference();
    for (let i = 0; i < 5; i++) {
      const clash = db().prepare("SELECT 1 FROM invoices WHERE reference = ?").get(reference);
      if (!clash) break;
      reference = newReference();
    }

    const invoice: Invoice = {
      id: newId(),
      user_id: user.id,
      plan: input.plan,
      term_index: termIndex,
      period_start: periodStart,
      period_end: periodEnd,
      due_date: current,
      amount_usd: amountUsd,
      fx_rate: rate,
      fx_date: input.fxDate,
      amount_cny: amountCny,
      status: "awaiting_payment",
      reference,
      created_at: nowIso(),
      submitted_at: null,
      paid_at: null,
      method: null,
      payer_note: null,
      verified_by: null,
      voided_at: null,
    };

    db()
      .prepare(
        `INSERT INTO invoices (
          id, user_id, plan, term_index, period_start, period_end, due_date,
          amount_usd, fx_rate, fx_date, amount_cny, status, reference, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invoice.id,
        invoice.user_id,
        invoice.plan,
        invoice.term_index,
        invoice.period_start,
        invoice.period_end,
        invoice.due_date,
        invoice.amount_usd,
        invoice.fx_rate,
        invoice.fx_date,
        invoice.amount_cny,
        invoice.status,
        invoice.reference,
        invoice.created_at,
      );

    event(input.actor ?? user.id, "invoice.created", {
      invoiceId: invoice.id,
      userId: user.id,
      plan: input.plan,
      termIndex,
      amountUsd,
    });
    return invoice;
  });
}

export function refreshPaidThrough(userId: string) {
  const row = db()
    .prepare("SELECT MAX(period_end) AS end FROM invoices WHERE user_id = ? AND status = 'paid'")
    .get(userId) as { end: string | null };
  db()
    .prepare("UPDATE users SET paid_through = ?, updated_at = ? WHERE id = ?")
    .run(row.end ?? null, nowIso(), userId);
}

export interface MarkPaidInput {
  invoiceId: string;
  method: PaymentMethod;
  amount: number;
  currency: "USD" | "CNY";
  txRef?: string | null;
  source: "manual" | "ingest" | "imap" | "admin";
  actor: string | null;
  note?: string | null;
  raw?: unknown;
  status?: "pending" | "confirmed";
}

export function markInvoicePaid(input: MarkPaidInput): Invoice {
  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(input.invoiceId) as unknown as Invoice | undefined;
  if (!invoice) throw new BillingError("Invoice not found.");
  if (invoice.status === "paid") throw new BillingError("Invoice is already paid.");
  if (invoice.status === "void") throw new BillingError("Invoice was voided.");

  const settings = getSettings();
  const amountUsd =
    input.currency === "CNY"
      ? Math.round((input.amount / (invoice.fx_rate || 1)) * 100) / 100
      : input.amount;

  return tx(() => {
    const at = nowIso();
    const paymentId = newId();
    db()
      .prepare(
        `INSERT INTO payments (id, invoice_id, method, currency, amount, amount_usd, fx_rate, fx_date, tx_ref, source, raw, status, created_at, confirmed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        paymentId,
        invoice.id,
        input.method,
        input.currency,
        input.amount,
        amountUsd,
        invoice.fx_rate,
        invoice.fx_date,
        input.txRef?.trim() || null,
        input.source,
        input.raw === undefined ? null : JSON.stringify(input.raw),
        input.status ?? "confirmed",
        at,
        input.status === "pending" ? null : at,
      );

    db()
      .prepare(
        `UPDATE invoices SET status = 'paid', paid_at = ?, method = ?, payer_note = COALESCE(?, payer_note),
           submitted_at = COALESCE(submitted_at, ?), verified_by = ? WHERE id = ?`,
      )
      .run(at, input.method, input.note ?? null, at, input.actor, invoice.id);

    refreshPaidThrough(invoice.user_id);
    event(input.actor, "invoice.paid", {
      invoiceId: invoice.id,
      paymentId,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
      source: input.source,
      toleranceUsd: settings.automation.toleranceUsd,
    });

    return db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id) as unknown as Invoice;
  });
}

export function submitInvoice(
  invoiceId: string,
  input: { method: PaymentMethod; currency: "USD" | "CNY"; amount: number; txRef?: string; note?: string },
  actor: string | null,
) {
  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as unknown as Invoice | undefined;
  if (!invoice) throw new BillingError("Invoice not found.");
  if (!["awaiting_payment", "overdue"].includes(invoice.status)) {
    throw new BillingError("This invoice is not awaiting a payment report.");
  }
  tx(() => {
    db()
      .prepare(
        "UPDATE invoices SET status = 'submitted', submitted_at = ?, method = ?, payer_note = ? WHERE id = ?",
      )
      .run(nowIso(), input.method, input.note ?? null, invoice.id);
    event(actor, "invoice.submitted", {
      invoiceId: invoice.id,
      amount: input.amount,
      currency: input.currency,
      method: input.method,
    });
  });
}

export function voidInvoice(invoiceId: string, actor: string | null) {
  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as unknown as Invoice | undefined;
  if (!invoice) throw new BillingError("Invoice not found.");
  if (invoice.status === "paid") throw new BillingError("Paid invoices cannot be voided. Refund manually first.");
  tx(() => {
    db().prepare("UPDATE invoices SET status = 'void', voided_at = ? WHERE id = ?").run(nowIso(), invoiceId);
    event(actor, "invoice.voided", { invoiceId });
  });
}

export function markOverdue(now = today(getSettings().plan.timezone)): number {
  const settings = getSettings();
  const cutoff = addDays(now, -settings.plan.graceDays);
  const result = db()
    .prepare(
      "UPDATE invoices SET status = 'overdue' WHERE status IN ('awaiting_payment','submitted') AND due_date < ? AND status <> 'void'",
    )
    .run(cutoff);
  return Number(result.changes ?? 0);
}
