import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDate, formatMoney, relativeDays, today } from "@/lib/dates";
import { PLANS, PLAN_ORDER, priceFor } from "@/lib/pricing";
import { nextTermIndex, openInvoiceFor } from "@/lib/billing";
import { statusFor } from "@/lib/storage";
import {
  HistoryCard,
  MemberHeader,
  MemberStats,
  MemberStorageCard,
} from "@/components/member/MemberSections";
import { Notice, StatusBadge } from "@/components/ui";
import type { Invoice, User } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(id) as unknown as User | undefined;
  if (!user || user.role !== "member") notFound();

  const settings = getSettings();
  const day = today(settings.plan.timezone);
  const open = openInvoiceFor(user.id);
  const termIndex = open?.term_index ?? nextTermIndex(user.id);
  const history = db()
    .prepare("SELECT * FROM invoices WHERE user_id = ? AND status <> 'void' ORDER BY created_at DESC LIMIT 12")
    .all(user.id) as unknown as Invoice[];
  const covered = Boolean(user.paid_through && user.paid_through >= day);
  const storage = statusFor(user, settings, day);

  return (
    <>
      <Notice tone="warn">
        <div className="row-between" style={{ gap: 12 }}>
          <span>
            Previewing the member dashboard as <strong>{user.name}</strong> ({user.email}). This is
            read-only — no actions are submitted as the member.
          </span>
          <Link href="/admin/members" className="btn btn-secondary btn-sm">
            Back to members
          </Link>
        </div>
      </Notice>

      <MemberHeader user={user} settings={settings} covered={covered} />
      <MemberStats user={user} open={open} termIndex={termIndex} storage={storage} settings={settings} covered={covered} />

      {settings.storage.enabled ? <MemberStorageCard settings={settings} storage={storage} /> : null}

      {open ? (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Open invoice (member view)</h2>
              <span className="muted small mono">{open.reference}</span>
            </div>
            <StatusBadge status={open.status} />
          </div>
          <div className="card-body stack">
            <dl className="dt">
              <dt>Amount</dt>
              <dd>
                {formatMoney(open.amount_usd)}{" "}
                <span className="muted">· ¥{open.amount_cny.toFixed(2)} @ {open.fx_rate.toFixed(4)}</span>
              </dd>
              <dt>Term</dt>
              <dd>
                {formatDate(open.period_start)} – {formatDate(open.period_end)}
              </dd>
              <dt>Due</dt>
              <dd>
                {formatDate(open.due_date)}{" "}
                <span className="muted">({relativeDays(open.due_date, settings.plan.timezone)})</span>
              </dd>
            </dl>
            <p className="muted small" style={{ marginBottom: 0 }}>
              The member sees a <strong>Pay {formatMoney(open.amount_usd)}</strong> button here, with
              payment handles, the reference and the “I have sent this payment” form.
            </p>
            <Link href="/admin/invoices" className="btn btn-secondary btn-sm">
              Open real invoice in admin
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Term picker (member view)</h2>
              <span className="muted small">What the member would see next.</span>
            </div>
          </div>
          <div className="card-body">
            <div className="price-grid">
              {PLAN_ORDER.map((key) => {
                const months = PLANS[key].months;
                const price = priceFor(key, termIndex, settings.pricing);
                return (
                  <div key={key} className="price-card">
                    <div className="price-name">{PLANS[key].label}</div>
                    <div className="price-amount">
                      {formatMoney(price)} <span>{months} months</span>
                    </div>
                    <div className="price-note">
                      {termIndex <= 1 ? "First-term price" : "Renewal price"} ·{" "}
                      {formatMoney(price / months)}/month
                    </div>
                    <div className="price-renew">
                      Renews at {formatMoney(priceFor(key, termIndex + 1, settings.pricing))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              The real dashboard turns each card into a “Choose term” form. Here it is display only.
            </p>
          </div>
        </div>
      )}

      <HistoryCard history={history} />

      <div className="card card-pad">
        <h2>Profile (read-only)</h2>
        <dl className="dt">
          <dt>Name</dt>
          <dd>{user.name}</dd>
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Status</dt>
          <dd>{user.status}</dd>
        </dl>
      </div>
    </>
  );
}
