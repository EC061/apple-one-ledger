import Link from "next/link";
import type { Metadata } from "next";
import { loginAction } from "@/app/actions/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the family plan ledger with your access code.",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That access code was not recognised. Check for typos, or ask the admin to reset it.",
  empty: "Enter your access code.",
  removed: "Your seat has been removed from this plan. Contact the admin.",
  rate: "Too many attempts. Wait 15 minutes and try again.",
  invite: "That invite link is not valid any more.",
  used: "That invite has already been used. Sign in with your access code instead.",
  expired: "That invite has expired. Ask the admin for a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">A1</span>
          <div>
            <strong>Apple One Ledger</strong>
            <div className="muted small">Member sign in</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22 }}>Welcome back</h1>
        <p className="muted small">Enter the access code you received when you joined.</p>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        <form action={loginAction} className="stack-sm">
          <div className="field">
            <label className="label" htmlFor="code">
              Access code
            </label>
            <input
              id="code"
              name="code"
              className="input mono"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
            <span className="hint">Format: four groups of four characters.</span>
          </div>
          <SubmitButton className="btn btn-primary btn-block" pending="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <hr />
        <div className="row-between small">
          <span className="muted">Have an invite link?</span>
          <span className="muted">Open it to create your seat.</span>
        </div>
        <div className="row-between small" style={{ marginTop: 10 }}>
          <Link href="/">← Back to overview</Link>
          <Link href="/about">How it works</Link>
          <Link href="/admin/login">Admin sign in</Link>
        </div>
      </div>
    </div>
  );
}
