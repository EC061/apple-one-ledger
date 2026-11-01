import { formatDateTime, formatMoney } from "@/lib/dates";
import { approvePaymentAction, rejectPaymentAction } from "@/app/actions/admin";
import { MethodBadge } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { PaymentMethod } from "@/lib/types";
import type { Settings } from "@/lib/settings";

export interface PendingPayment {
  id: string;
  invoice_id: string;
  method: PaymentMethod;
  amount: number;
  currency: "USD" | "CNY";
  amount_usd: number;
  created_at: string;
  user_name: string;
  reference: string;
  expected_usd: number;
  proof_url: string | null;
}

export function PendingPayments({ pending, settings }: { pending: PendingPayment[]; settings: Settings }) {
  if (pending.length === 0) return null;
  return (
    <>
      {pending.length > 0 ? (
        <div className="card">
          <div className="card-head">
            <h2>Payments to review</h2>
            <span className="badge badge-warn">{pending.length}</span>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Reference</th>
                  <th>Method</th>
                  <th className="right">Received</th>
                  <th>When</th>
                  <th className="right">Decide</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.user_name}</td>
                    <td className="mono small">{payment.reference}</td>
                    <td>
                      <MethodBadge method={payment.method} />
                    </td>
                    <td className="right">
                      {payment.currency === "CNY" ? `¥${payment.amount.toFixed(2)}` : formatMoney(payment.amount)}
                      <div className="muted small">
                        ≈ {formatMoney(payment.amount_usd)} of {formatMoney(payment.expected_usd)}
                      </div>
                    </td>
                    <td className="small">{formatDateTime(payment.created_at, settings.plan.timezone)}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                        {payment.proof_url ? (
                          <a href={payment.proof_url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                            Proof
                          </a>
                        ) : null}
                        <form action={approvePaymentAction} className="row" style={{ gap: 6 }}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <label className="check small" title="Approve a payment smaller than the invoice">
                            <input type="checkbox" name="partial" />
                            <span>partial</span>
                          </label>
                          <SubmitButton className="btn btn-primary btn-sm" pending="…">
                            Approve
                          </SubmitButton>
                        </form>
                        <form action={rejectPaymentAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <SubmitButton className="btn btn-danger btn-sm" pending="…">
                            Reject
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
