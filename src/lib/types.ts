export type Role = "admin" | "member";
export type MemberStatus = "active" | "removed";
export type Plan = "quarterly" | "semiannual" | "annual";
export type InvoiceStatus = "awaiting_payment" | "submitted" | "paid" | "overdue" | "void";
export type PaymentMethod = "wechat" | "alipay" | "venmo" | "zelle";
export type PaymentSource = "manual" | "ingest" | "imap" | "admin";

export interface User {
  id: string;
  role: Role;
  name: string;
  email: string;
  access_code_hash: string | null;
  password_hash: string | null;
  status: MemberStatus;
  paid_through: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invite {
  code: string;
  label: string | null;
  created_at: string;
  expires_at: string | null;
  used_at: string | null;
  used_by: string | null;
  revoked_at: string | null;
}

export interface Invoice {
  id: string;
  user_id: string;
  plan: Plan;
  term_index: number;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_usd: number;
  fx_rate: number;
  fx_date: string;
  amount_cny: number;
  status: InvoiceStatus;
  reference: string;
  created_at: string;
  submitted_at: string | null;
  paid_at: string | null;
  method: PaymentMethod | null;
  payer_note: string | null;
  verified_by: string | null;
  voided_at: string | null;
}

export interface Payment {
  id: string;
  invoice_id: string;
  method: PaymentMethod;
  currency: "USD" | "CNY";
  amount: number;
  amount_usd: number | null;
  fx_rate: number | null;
  fx_date: string | null;
  tx_ref: string | null;
  source: PaymentSource;
  raw: string | null;
  proof_url: string | null;
  status: "pending" | "confirmed" | "rejected";
  created_at: string;
  confirmed_at: string | null;
}

export interface FxRate {
  date: string;
  rate: number;
  source: string | null;
  fetched_at: string;
}
