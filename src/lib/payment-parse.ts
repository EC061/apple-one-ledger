export interface ParsedPayment {
  amount: number | null;
  currency: "USD" | "CNY" | null;
  txRef: string | null;
  reference: string | null;
  paidAt: string | null;
  confidence: "high" | "medium" | "low";
}

const REFERENCE = /\bA1-[A-HJ-NP-Z2-9]{6,10}\b/i;
const LABELED_TX =
  /(?:交易单号|交易号|订单号|流水号|凭证号|转账单号|transaction\s*(?:id|no)|reference\s*(?:no|id)|ref)\s*[:：#]?\s*([A-Za-z0-9]{8,40})/i;
const LABELED_AMOUNT =
  /(?:金额|付款金额|支付金额|转账金额|合计|总计|amount|total)\s*[:：]?\s*(?:¥|￥|CNY|RMB|USD|\$)?\s*([\d,]+(?:\.\d{1,2})?)/i;
const CNY_AMOUNT = /(?:¥|￥|CNY|RMB|人民币)\s*([\d,]+(?:\.\d{1,2})?)/i;
const USD_AMOUNT = /(?:USD|US\$|\$)\s*([\d,]+(?:\.\d{1,2})?)/i;
const DATE = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/;

function toNumber(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return Math.round(value * 100) / 100;
}

/**
 * Pull the useful fields out of a payment receipt, whether the text came from
 * OCR or from the user pasting an iOS Live Text selection.
 *
 * Deliberately conservative: it returns nulls rather than guessing, and the UI
 * always asks the member to confirm before anything is submitted.
 */
export function parsePaymentText(input: string): ParsedPayment {
  const text = (input || "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    // OCR frequently reads the letter O/1 in the reference as A1/Al/AI.
    .replace(/\b(?:Al|AI)\s*[-–—]\s*/g, "A1-");

  let amount: number | null = null;
  let currency: "USD" | "CNY" | null = null;

  const cny = text.match(CNY_AMOUNT);
  const usd = text.match(USD_AMOUNT);
  const labeled = text.match(LABELED_AMOUNT);

  if (cny) {
    amount = toNumber(cny[1]);
    currency = amount ? "CNY" : null;
  }
  if (!amount && usd) {
    amount = toNumber(usd[1]);
    currency = amount ? "USD" : null;
  }
  if (!amount && labeled) {
    amount = toNumber(labeled[1]);
  }
  if (!amount && cny === null && usd === null) {
    // Last resort: a decimal number with two places, e.g. "45.00".
    const decimal = text.match(/\b(\d{1,3}(?:,\d{3})*\.\d{2})\b/);
    if (decimal) amount = toNumber(decimal[1]);
  }

  // Receipts from the CNY apps often OCR the ¥ glyph as "Y"; fall back to the
  // provider's name rather than leaving the currency ambiguous.
  if (amount && !currency && /wechat|weixin|微信|alipay|支付宝|人民币|\bRMB\b/i.test(text)) {
    currency = "CNY";
  }

  let txRef: string | null = null;
  const labeledTx = text.match(LABELED_TX);
  if (labeledTx) txRef = labeledTx[1].trim();
  if (!txRef) {
    // Longest digit run is usually the provider's transaction number; ignore
    // runs that are part of a date or the ledger's own reference.
    const runs = (text.match(/\b\d{10,32}\b/g) || []).filter(
      (run) => !(run.length === 8 && /^(19|20)\d{6}$/.test(run)) && run.length !== 14,
    );
    if (runs.length) txRef = runs.sort((a, b) => b.length - a.length)[0];
  }

  const referenceMatch = text.match(REFERENCE);
  const dateMatch = text.match(DATE);
  const candidate = dateMatch
    ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
    : null;
  const candidateDate = candidate ? new Date(`${candidate}T00:00:00Z`) : null;
  const paidAt =
    candidate && candidateDate && !Number.isNaN(candidateDate.getTime()) &&
    candidateDate.toISOString().slice(0, 10) === candidate
      ? candidate
      : null;

  const confidence: ParsedPayment["confidence"] =
    amount && (txRef || referenceMatch) ? "high" : amount ? "medium" : "low";

  return {
    amount,
    currency,
    txRef,
    reference: referenceMatch ? referenceMatch[0].toUpperCase() : null,
    paidAt,
    confidence,
  };
}
