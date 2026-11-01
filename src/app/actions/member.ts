"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createInvoice, openInvoiceFor, submitInvoice, BillingError } from "@/lib/billing";
import { getCurrentRate } from "@/lib/fx";
import { isPlan } from "@/lib/pricing";
import { isPaymentMethod } from "@/lib/labels";
import { db, nowIso, event } from "@/lib/db";
import type { Invoice } from "@/lib/types";

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function amount(data: FormData, key: string): number {
  return Number(text(data, key).replace(/,/g, ""));
}

export async function createInvoiceAction(formData: FormData) {
  const user = await requireUser();
  const plan = text(formData, "plan");
  if (!isPlan(plan)) redirect("/dashboard?error=plan");

  if (openInvoiceFor(user.id)) redirect("/dashboard?error=open");

  const rate = await getCurrentRate().catch(() => null);
  if (!rate || rate.source === "fallback") redirect("/dashboard?error=fx");

  let invoiceId: string;
  let created: import("@/lib/types").Invoice | null = null;
  try {
    created = createInvoice({
      userId: user.id,
      plan,
      fxRate: rate.rate,
      fxDate: rate.date,
      actor: user.id,
    });
    invoiceId = created.id;
  } catch (error) {
    const message = error instanceof BillingError ? error.message : "Could not create the invoice.";
    if (error instanceof BillingError && error.message.includes("already an open")) {
      redirect("/dashboard?error=open");
    }
    redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/pay/${invoiceId}`);
}

export async function submitPaymentAction(formData: FormData) {
  const user = await requireUser();
  const invoiceId = text(formData, "invoiceId");
  const method = text(formData, "method");
  const currency = text(formData, "currency") === "CNY" ? "CNY" : "USD";
  let value = amount(formData, "amount");
  const txRef = text(formData, "txRef");
  const note = text(formData, "note");

  const invoice = db().prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId) as unknown as Invoice | undefined;
  if (!invoice || (invoice.user_id !== user.id && user.role !== "admin")) redirect("/dashboard");
  if (!isPaymentMethod(method)) redirect(`/dashboard/pay/${invoiceId}?error=method`);

  // No-JS fallback: the amount field is seeded in USD. Only swap when the
  // value is still the untouched default — never when OCR or the member typed
  // an amount that happens to equal the other currency's default.
  const source = text(formData, "amountSource") || "default";
  if (source === "default" && currency === "CNY" && value === invoice.amount_usd) {
    value = invoice.amount_cny;
  }
  if (source === "default" && currency === "USD" && value === invoice.amount_cny) {
    value = invoice.amount_usd;
  }

  if (!Number.isFinite(value) || value <= 0) redirect(`/dashboard/pay/${invoiceId}?error=amount`);

  try {
    submitInvoice(invoiceId, { method, currency, amount: value, txRef: txRef || undefined, note: note || undefined }, user.id);
  } catch (error) {
    const message = error instanceof BillingError ? error.message : "Could not submit the payment.";
    redirect(`/dashboard/pay/${invoiceId}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?submitted=1");
}

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const back = user.role === "admin" ? "/admin/settings" : "/dashboard";

  if (name.length < 2 || name.length > 60) redirect(`${back}?error=name`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`${back}?error=email`);

  const clash = db()
    .prepare("SELECT 1 FROM users WHERE lower(email) = ? AND id <> ?")
    .get(email, user.id);
  if (clash) redirect(`${back}?error=emailused`);

  db().prepare("UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?").run(
    name,
    email,
    nowIso(),
    user.id,
  );
  event(user.id, "profile.updated", { email });
  revalidatePath(back);
  redirect(`${back}?saved=profile`);
}
