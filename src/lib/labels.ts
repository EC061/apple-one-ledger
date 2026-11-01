import type { PaymentMethod } from "./types";

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  wechat: "WeChat Pay",
  alipay: "Alipay",
  venmo: "Venmo",
  zelle: "Zelle",
};
