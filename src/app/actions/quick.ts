"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { db, event } from "@/lib/db";
import { getSettings, patchSection } from "@/lib/settings";
import { isPlan } from "@/lib/pricing";
import { getCurrentRate } from "@/lib/fx";
import { createInvoice, markInvoicePaid, openInvoiceFor } from "@/lib/billing";
import { isPaymentMethod } from "@/lib/labels";
import { saveProofUpload, saveQrUpload } from "@/lib/uploads";
import { sendReceiptForInvoice } from "@/lib/email";
import type { User } from "@/lib/types";

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function amount(data: FormData, key: string): number {
  return Number(text(data, key).replace(/,/g, ""));
}

/** Quick control: choose member + plan + method, optionally attach proof, mark paid. */
export async function quickMarkPaidAction(formData: FormData) {
  await requireAdmin();
  const userId = text(formData, "userId");
  const plan = text(formData, "plan");
  const method = text(formData, "method");
  const currency = text(formData, "currency") === "CNY" ? "CNY" : "USD";
  let value = amount(formData, "amount");

  const member = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User | undefined;
  if (!member || member.status !== "active" || member.role !== "member") redirect("/quick?error=member");
  if (!isPlan(plan) || !isPaymentMethod(method) || value <= 0) redirect("/quick?error=input");

  let invoice = openInvoiceFor(member.id);
  if (!invoice) {
    const rate = await getCurrentRate().catch(() => null);
    if (!rate || rate.source === "fallback") redirect("/quick?error=fx");
    try {
      invoice = createInvoice({
        userId: member.id,
        plan,
        fxRate: rate.rate,
        fxDate: rate.date,
        actor: "admin",
      });
    } catch {
      redirect("/quick?error=invoice");
    }
  }

  if (currency === "CNY" && value === invoice.amount_usd) value = invoice.amount_cny;
  if (currency === "USD" && value === invoice.amount_cny) value = invoice.amount_usd;

  let proofUrl: string | null = null;
  const proof = formData.get("proof");
  if (proof instanceof File && proof.size > 0) {
    try {
      proofUrl = await saveProofUpload(proof);
    } catch {
      redirect("/quick?error=proof");
    }
  }

  try {
    markInvoicePaid({
      invoiceId: invoice.id,
      method,
      amount: value,
      currency,
      txRef: null,
      source: "admin",
      actor: "admin",
      proofUrl,
    });
  } catch {
    redirect("/quick?error=payment");
  }

  event("admin", "quick.payment", { invoiceId: invoice.id, userId: member.id, amount: value, currency });
  await sendReceiptForInvoice(invoice.id);
  refresh();
  redirect("/quick?saved=paid");
}

/** Quick control: replace the WeChat / Alipay QR images. */
export async function quickUploadQrAction(formData: FormData) {
  await requireAdmin();
  const current = getSettings().payments;

  let wechat = current.wechatQrUrl;
  let alipay = current.alipayQrUrl;

  const wechatFile = formData.get("wechatQrFile");
  if (wechatFile instanceof File && wechatFile.size > 0) {
    try {
      wechat = await saveQrUpload(wechatFile, "wechat");
    } catch {
      redirect("/quick?error=qr");
    }
  }

  const alipayFile = formData.get("alipayQrFile");
  if (alipayFile instanceof File && alipayFile.size > 0) {
    try {
      alipay = await saveQrUpload(alipayFile, "alipay");
    } catch {
      redirect("/quick?error=qr");
    }
  }

  patchSection("payments", { ...current, wechatQrUrl: wechat, alipayQrUrl: alipay });
  event("admin", "quick.qr", {});
  refresh();
  redirect("/quick?saved=qr");
}

function refresh() {
  revalidatePath("/quick");
  revalidatePath("/admin");
  revalidatePath("/admin/invoices");
  revalidatePath("/dashboard");
}

