import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/dates";
import { nextTermIndex, openInvoiceFor } from "@/lib/billing";
import { MemberDashboard } from "@/components/member/MemberDashboard";
import InstallHint from "@/components/InstallHint";
import type { Invoice, User } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as User | undefined;
  if (!user) notFound();

  const settings = getSettings();
  const day = today(settings.plan.timezone);
  const open = openInvoiceFor(user.id);
  const termIndex = open?.term_index ?? nextTermIndex(user.id);
  const history = db()
    .prepare("SELECT * FROM invoices WHERE user_id = ? AND status <> 'void' ORDER BY created_at DESC LIMIT 12")
    .all(user.id) as unknown as Invoice[];
  const covered = Boolean(user.paid_through && user.paid_through >= day);

  return (
    <>
      <div className="row-between">
        <span className="muted small">
          Read-only preview of <strong>{user.name}</strong>’s dashboard ({user.email}). Nothing here submits as the
          member.
        </span>
        <Link href="/admin/members" className="btn btn-secondary btn-sm">
          Back to members
        </Link>
      </div>

      <InstallHint />

      <MemberDashboard
        user={user}
        settings={settings}
        open={open}
        termIndex={termIndex}
        history={history}
        covered={covered}
        readOnly
      />
    </>
  );
}
