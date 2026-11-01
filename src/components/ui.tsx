import type { InvoiceStatus, MemberStatus, PaymentMethod } from "@/lib/types";
import { METHOD_LABELS } from "@/lib/labels";

const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  awaiting_payment: "Awaiting payment",
  submitted: "Submitted",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

const INVOICE_CLASSES: Record<InvoiceStatus, string> = {
  awaiting_payment: "badge-pending",
  submitted: "badge-warn",
  paid: "badge-paid",
  overdue: "badge-overdue",
  void: "badge-void",
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`badge ${INVOICE_CLASSES[status] ?? "badge-void"}`}>{INVOICE_LABELS[status] ?? status}</span>;
}

export function MemberBadge({ status }: { status: MemberStatus }) {
  return (
    <span className={`badge ${status === "active" ? "badge-paid" : "badge-void"}`}>
      {status === "active" ? "Active" : "Removed"}
    </span>
  );
}

export function MethodBadge({ method }: { method: PaymentMethod | null }) {
  if (!method) return <span className="muted">—</span>;
  return <span className="pill">{METHOD_LABELS[method]}</span>;
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${tone ?? ""}`}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "ok" | "warn" | "error";
  children: React.ReactNode;
}) {
  const className =
    tone === "ok" ? "notice notice-ok" : tone === "warn" ? "notice notice-warn" : tone === "error" ? "notice notice-error" : "notice";
  return (
    <div className={className} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <span className="brand">
      <span className="brand-mark">A1</span>
      <span>
        Apple One Ledger
        {subtitle ? <span className="muted small" style={{ display: "block", fontWeight: 500 }}>{subtitle}</span> : null}
      </span>
    </span>
  );
}
