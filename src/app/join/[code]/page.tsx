import Link from "next/link";
import { db } from "@/lib/db";
import { seatCapacity, seatsUsed } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { formatMoney, today } from "@/lib/dates";
import { joinAction } from "@/app/actions/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";
import type { Invite } from "@/lib/types";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  name: "Enter your name (2–60 characters).",
  email: "Enter a valid email address — reminders and receipts go there.",
  exists: "That email is already on this plan. Sign in with your access code instead.",
  full: "All seats are taken. Ask the admin to free one up.",
  rate: "Too many attempts from this network. Try again later.",
  invite: "That invite is no longer valid.",
  used: "That invite has already been used.",
  expired: "That invite has expired.",
};

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const settings = getSettings();
  const invite = db()
    .prepare("SELECT * FROM invites WHERE code = ?")
    .get(code.toUpperCase()) as unknown as Invite | undefined;

  const day = today(settings.plan.timezone);
  const invalidReason = !invite
    ? "This invite link is not valid."
    : invite.revoked_at
      ? "This invite was revoked."
      : invite.used_at
        ? "This invite has already been used."
        : invite.expires_at && invite.expires_at < day
          ? "This invite has expired."
          : null;

  const seatsLeft = Math.max(seatCapacity() - seatsUsed(), 0);

  if (invalidReason) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1 style={{ fontSize: 22 }}>Invite unavailable</h1>
          <p className="muted">{invalidReason}</p>
          <div className="stack-sm" style={{ marginTop: 18 }}>
            <Link href="/login" className="btn btn-primary btn-block">
              Sign in with an access code
            </Link>
            <Link href="/" className="btn btn-secondary btn-block">
              Back to overview
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <span className="pill">Seat invite · {seatsLeft} of {settings.plan.seats} open</span>
        <h1 style={{ fontSize: 24, marginTop: 12 }}>Join the family plan</h1>
        <p className="muted small">
          You are joining <strong>{settings.plan.name}</strong>. This invite can only be used once, and it only
          works on this deployment.
        </p>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        <div className="card card-pad" style={{ background: "var(--surface-2)", boxShadow: "none", marginBottom: 16 }}>
          <div className="small strong" style={{ marginBottom: 8 }}>
            Pricing before you commit
          </div>
          <div className="small muted">
            First term is flat: <strong>{formatMoney(settings.pricing.firstTerm.quarterly)}</strong> quarterly ·{" "}
            <strong>{formatMoney(settings.pricing.firstTerm.semiannual)}</strong> half-year ·{" "}
            <strong>{formatMoney(settings.pricing.firstTerm.annual)}</strong> annual.
            <br />
            Renewals: <strong>{formatMoney(settings.pricing.renewal.quarterly)}</strong> quarterly ·{" "}
            <strong>{formatMoney(settings.pricing.renewal.semiannual)}</strong> half-year ·{" "}
            <strong>{formatMoney(settings.pricing.renewal.annual)}</strong> annual. You choose the term after joining and
            see the exact renewal price on every invoice.
          </div>
        </div>

        <form action={joinAction} className="stack-sm">
          <input type="hidden" name="code" value={code.toUpperCase()} />

          <div className="field">
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" name="name" className="input" placeholder="Alex Chen" autoComplete="name" required />
          </div>

          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
            <span className="hint">Used for payment reminders, receipts, and your access code.</span>
          </div>

          {seatsLeft === 0 ? (
            <Notice tone="warn">All seats are currently taken. The admin needs to remove a member first.</Notice>
          ) : (
            <SubmitButton className="btn btn-primary btn-block" pending="Claiming your seat…">
              Claim my seat
            </SubmitButton>
          )}
        </form>

        <p className="hint" style={{ marginTop: 14 }}>
          By joining you agree to pay your share each term. Unpaid seats are removed after the{" "}
          {settings.plan.graceDays}-day grace period.
        </p>
      </div>
    </div>
  );
}
