import type { PaymentSettings } from "./settings";

export interface PaymentDestination {
  key: "venmo" | "zelle" | "wechat" | "alipay";
  label: string;
  value: string;
  qr?: string;
}

/** The methods and handles exactly as the pay page shows them. */
export function paymentDestinations(pay: PaymentSettings): PaymentDestination[] {
  return [
    { key: "venmo", label: "Venmo", value: pay.venmoHandle ? `@${pay.venmoHandle}` : "" },
    { key: "zelle", label: "Zelle", value: pay.zelleEmail },
    { key: "wechat", label: "WeChat Pay", value: "", qr: pay.wechatQrUrl },
    { key: "alipay", label: "Alipay", value: "", qr: pay.alipayQrUrl },
  ];
}

export function configuredDestinations(pay: PaymentSettings): PaymentDestination[] {
  return paymentDestinations(pay).filter((item) => item.value || item.qr);
}
