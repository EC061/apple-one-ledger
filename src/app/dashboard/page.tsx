import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/dates";
import { openInvoiceFor, nextTermIndex } from "@/lib/billing";
import { db } from "@/lib/db";
import TopBar from "@/components/TopBar";
import { MemberDashboard } from "@/components/member/MemberDashboard";
import { Notice } from "@/components/ui";
import InstallHint from "@/components/InstallHint";
import type { Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  plan: "Pick a valid term.",
  open: "You already have an open invoice. Pay it, or ask the admin to void it.",
  name: "Enter your name (2–60 characters).",
  email: "Enter a valid email address.",
  emailused: "That email is already used by another member.",
  fx: "No USD→CNY rate is available. Ask the admin to set a rate in Settings → Exchange rate.",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; submitted?: string; error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "admin") redirect("/admin");

  const params = await searchParams;
  const settings = getSettings();
  const day = today(settings.plan.timezone);
  const open = openInvoiceFor(user.id);
  const termIndex = open?.term_index ?? nextTermIndex(user.id);
  const history = db()
    .prepare("SELECT * FROM invoices WHERE user_id = ? AND status <> 'void' ORDER BY created_at DESC LIMIT 12")
    .all(user.id) as unknown as Invoice[];

  const covered = user.paid_through && user.paid_through >= day;

  return (
    <div className="page">
      <TopBar user={user} area="member" />
      <main className="grow">
        <div className="container stack">
          <InstallHint />

          {params.joined ? (
            <Notice tone="ok">
              Welcome aboard. Your seat is active — choose a term below when you are ready to pay.
            </Notice>
          ) : null}
          {params.submitted ? (
            <Notice tone="ok">
              Payment reported. The admin will confirm it, and you will get a receipt by email.
            </Notice>
          ) : null}
          {params.saved === "profile" ? <Notice tone="ok">Profile updated.</Notice> : null}
          {params.error ? (
            <Notice tone="error">{ERRORS[params.error] ?? "Something went wrong. Please try again."}</Notice>
          ) : null}

          <MemberDashboard
            user={user}
            settings={settings}
            open={open}
            termIndex={termIndex}
            history={history}
            covered={Boolean(covered)}
          />
        </div>
      </main>
      <footer className="footer">
        <div className="container row-between">
          <span>{settings.plan.name}</span>
          <span className="muted">Payments in USD or CNY · WeChat · Alipay · Venmo · Zelle</span>
        </div>
      </footer>
    </div>
  );
}
