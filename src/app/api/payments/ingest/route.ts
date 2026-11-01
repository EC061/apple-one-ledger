import { z } from "zod";
import { bearerAuthorized, json } from "@/lib/api";
import { getSettings } from "@/lib/settings";
import { ingestPayment } from "@/lib/reconcile";
import { sendReceiptForInvoice } from "@/lib/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  reference: z.string().min(3).max(32),
  amount: z.number().positive().max(1_000_000),
  currency: z.enum(["USD", "CNY"]).default("USD"),
  method: z.enum(["wechat", "alipay", "venmo", "zelle"]),
  txRef: z.string().max(200).optional(),
  paidAt: z.string().max(64).optional(),
  payer: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/payments/ingest
 * Authorization: Bearer $INGEST_TOKEN
 *
 * Body: { reference, amount, currency, method, txRef?, note? }
 *
 * Point a bank/provider webhook or email-forwarding rule here. Payments that
 * match the invoice reference and amount are confirmed automatically.
 */
export async function POST(request: Request) {
  if (!bearerAuthorized(request, process.env.INGEST_TOKEN)) {
    return json({ ok: false, error: "Unauthorized. Set INGEST_TOKEN and send it as a Bearer token." }, 401);
  }
  if (!getSettings().automation.ingestEnabled) {
    return json({ ok: false, error: "Payment ingest is disabled in settings." }, 403);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Body must be JSON." }, 400);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return json({ ok: false, error: "Invalid payload.", issues: parsed.error.issues }, 400);
  }

  const result = ingestPayment(parsed.data);
  if (result.status === "paid" && result.invoiceId) {
    await sendReceiptForInvoice(result.invoiceId);
  }
  const status = result.status === "unmatched" ? 404 : result.status === "error" ? 422 : 200;
  return json(result, status);
}
