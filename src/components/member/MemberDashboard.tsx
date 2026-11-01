import {
  BillingSection,
  HistoryCard,
  MemberHeader,
  MemberStats,
  ProfileCards,
} from "@/components/member/MemberSections";
import { PaymentMethodsCard } from "@/components/member/PaySections";
import type { PaymentDestination } from "@/lib/payment-destinations";
import type { Settings } from "@/lib/settings";
import type { Invoice, User } from "@/lib/types";

/**
 * The member dashboard body, shared by /dashboard and the admin preview so the
 * preview shows the real thing rather than a reduced mock-up. `readOnly` keeps
 * every form and link inert for the preview.
 */
export function MemberDashboard({
  user,
  settings,
  open,
  termIndex,
  history,
  covered,
  readOnly = false,
  paymentPreview,
}: {
  user: User;
  settings: Settings;
  open: Invoice | null;
  termIndex: number;
  history: Invoice[];
  covered: boolean;
  readOnly?: boolean;
  /** Preview only: show the member-facing payment methods after the invoice/term section. */
  paymentPreview?: { methodRows: PaymentDestination[]; reference: string | null };
}) {
  return (
    <>
      <MemberHeader user={user} settings={settings} covered={covered} />
      <MemberStats user={user} open={open} termIndex={termIndex} settings={settings} covered={covered} />
      <BillingSection
        open={open}
        termIndex={termIndex}
        settings={settings}
        readOnly={readOnly}
        isAdmin={user.role === "admin"}
      />
      {paymentPreview ? (
        <div className="stack">
          <p className="muted small" style={{ marginBottom: 0 }}>
            Payment methods shown to the member on the pay page.
          </p>
          <PaymentMethodsCard
            settings={settings}
            methodRows={paymentPreview.methodRows}
            reference={paymentPreview.reference}
          />
        </div>
      ) : null}
      <HistoryCard history={history} readOnly={readOnly} />
      <ProfileCards user={user} readOnly={readOnly} />
    </>
  );
}
