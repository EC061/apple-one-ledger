import {
  BillingSection,
  HistoryCard,
  MemberHeader,
  MemberStats,
  ProfileCards,
} from "@/components/member/MemberSections";
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
}: {
  user: User;
  settings: Settings;
  open: Invoice | null;
  termIndex: number;
  history: Invoice[];
  covered: boolean;
  readOnly?: boolean;
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
      <HistoryCard history={history} readOnly={readOnly} />
      <ProfileCards user={user} readOnly={readOnly} />
    </>
  );
}
