import type { PaymentMethod } from "./types";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  wechat: "WeChat Pay",
  alipay: "Alipay",
  venmo: "Venmo",
  zelle: "Zelle",
};

const METHODS: PaymentMethod[] = ["wechat", "alipay", "venmo", "zelle"];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && METHODS.includes(value as PaymentMethod);
}
