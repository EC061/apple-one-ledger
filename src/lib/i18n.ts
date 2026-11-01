import { cookies, headers } from "next/headers";

export type Lang = "en" | "zh";

export const LANG_COOKIE = "a1_lang";

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "zh";
}

/** Cookie first, then Accept-Language (any zh* → Chinese), else English. */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const cookie = store.get(LANG_COOKIE)?.value;
  if (isLang(cookie)) return cookie;

  const h = await headers();
  const accept = (h.get("accept-language") || "").toLowerCase();
  return /(^|,)\s*zh(-|,|;|$)/.test(accept) ? "zh" : "en";
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

export const dict = {
  en: {
    langLabel: "中文",
    themeToLight: "Light mode",
    themeToDark: "Dark mode",
    navHow: "How it works",
    signIn: "Sign in",
    eyebrow: "{seats} seats · invite-only",
    h1: "One family plan. {seats} people. Zero spreadsheets.",
    lede: "A private ledger for our shared {plan}: what you owe, when it is due, and a seat that stays covered. Pay in USD or CNY.",
    ctaSignIn: "Sign in with your code",
    ctaHow: "Read the rules",
    servicesTitle: "Everything included",
    servicesSub: "{n} services, one subscription.",
    icloudName: "iCloud+ 2 TB",
    icloudNote: "2 TB shared · ≈{gb} GB per person",
    icloudBar: "Shared pool, one segment per seat",
    pricingTitle: "Choose a term",
    pricingSub: "Pay up front, in whichever cadence is easiest.",
    firstTerm: "First term",
    renewal: "Renews at {amount}",
    months: "{n} months",
    costTitle: "Cost basis",
    costTotal: "Plan total / month",
    costSeats: "Split across seats",
    costPerSeat: "Per seat / month",
    costQuarter: "Quarterly term, per month",
    costNote: "Term prices round to whole dollars, which is why a quarter costs {quarter} rather than exactly {exact}.",
    rulesTitle: "Read this before your first payment",
    rules: [
      "The first term is an introductory flat price. Every later term renews at the price on this page.",
      "Coverage runs for 3, 6 or 12 months and starts the day after your current paid-through date.",
      "CNY amounts lock the USD→CNY rate on the day the invoice is issued, so they do not move.",
      "Payment is due within {dueDays} days of the invoice date; reminders go out before and after it.",
      "Seats unpaid after {grace} days are flagged for removal; the admin can disable a seat at any time.",
    ],
    payTitle: "Payment methods",
    paySub: "Pay in USD or CNY, then report the payment in the dashboard. The admin confirms it and you get a receipt.",
    payNote: "Exact handles and QR codes are on your invoice after you sign in — never published here.",
    emailTitle: "Email you will receive",
    emailText: "Invite or access code, reminders, overdue notices, a removal warning, and a receipt.",
    storageTitle: "Storage share",
    storageText: "The {pool} GB pool is split {count} ways: about {gb} GB each. Fair-share guideline, not a hard cap.",
    accessTitle: "Invite-only",
    accessText: "Joining needs a one-time invite token from the admin. {seats} seats in total; unused seats are visible in the pool.",
    footer: "Self-hosted family ledger",
  },
  zh: {
    langLabel: "English",
    themeToLight: "浅色模式",
    themeToDark: "深色模式",
    navHow: "规则说明",
    signIn: "登录",
    eyebrow: "{seats} 个席位 · 仅限邀请",
    h1: "一个家庭方案，{seats} 人共享，账目一清二楚。",
    lede: "我们共享 {plan} 的私人账本：应付多少、何时到期、席位是否有效，一目了然。支持美元或人民币支付。",
    ctaSignIn: "使用访问码登录",
    ctaHow: "查看规则",
    servicesTitle: "方案包含的全部服务",
    servicesSub: "{n} 项服务，一份订阅。",
    icloudName: "iCloud+ 2 TB",
    icloudNote: "2 TB 共享 · 每人约 {gb} GB",
    icloudBar: "共享存储池，每个席位一段",
    pricingTitle: "选择付费周期",
    pricingSub: "一次性预付，按你方便的周期。",
    firstTerm: "首期价格",
    renewal: "续费 {amount}",
    months: "{n} 个月",
    costTitle: "费用构成",
    costTotal: "方案月费合计",
    costSeats: "按席位分摊",
    costPerSeat: "每席位每月",
    costQuarter: "季付折合每月",
    costNote: "各期价格按整美元取整，因此季付为 {quarter}，而不是精确的 {exact}。",
    rulesTitle: "首次付款前请阅读",
    rules: [
      "首期为优惠固定价，之后每一期按本页所示续费价计费。",
      "有效期 3、6 或 12 个月，从当前有效期的次日开始计算。",
      "人民币金额按开票当天的美元兑人民币汇率锁定，之后不再变动。",
      "账单开出后 {dueDays} 天内付款；到期前和逾期后都会通过邮件提醒。",
      "逾期 {grace} 天后席位会被标记为待移除；管理员可随时停用席位。",
    ],
    payTitle: "支付方式",
    paySub: "可使用美元或人民币支付，然后在面板中登记付款。管理员确认后你会收到收据邮件。",
    payNote: "具体收款账号和二维码只显示在登录后的账单上，不会公开在本页。",
    emailTitle: "你会收到的邮件",
    emailText: "邀请或访问码、付款提醒、逾期通知、移除警告，以及付款收据。",
    storageTitle: "存储空间",
    storageText: "{pool} GB 存储池按 {count} 人平分，每人约 {gb} GB。这是公平分摊建议，并非硬性上限。",
    accessTitle: "仅限邀请",
    accessText: "加入需要管理员签发的一次性邀请码。共 {seats} 个席位，空余席位可在管理员面板查看。",
    footer: "自托管家庭账本",
  },
} as const;

export type Copy = {
  [K in keyof (typeof dict)["en"]]: (typeof dict)["en"][K] extends readonly string[] ? readonly string[] : string;
};
