import Link from "next/link";
import type { Metadata } from "next";
import { signupAction } from "@/app/actions/auth";
import { adminCodeConfigured } from "@/lib/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create your account with an invite code and choose a password.",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That code was not recognised.",
  rate: "Too many attempts. Wait 15 minutes.",
  empty: "Enter your invite or admin code.",
  email: "Enter a valid email address.",
  name: "Enter your name (2–60 characters).",
  weak: "Use at least 12 characters and mix upper case, lower case, numbers or symbols.",
  used: "That invite has already been used.",
  expired: "That invite has expired.",
  full: "All seats are taken.",
  exists: "That email already has an account — sign in instead.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const { error, code } = await searchParams;
  const adminReady = adminCodeConfigured();

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 500 }}>
        <div className="auth-brand">
          <span className="brand-mark">A1</span>
          <div>
            <strong>Apple One Ledger</strong>
            <div className="muted small">Create an account</div>
          </div>
        </div>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        <h1 style={{ fontSize: 22 }}>Join with your code</h1>
        <p className="muted small">
          An invite creates a member seat. The admin registration code creates (or recovers) the
          admin. You choose the email and password used to sign in.
        </p>

        <form action={signupAction} className="stack-sm">
          <div className="field">
            <label className="label" htmlFor="code">
              Invite or admin code
            </label>
            <input
              id="code"
              name="code"
              className="input mono"
              placeholder="XXXXX-XXXXX or ADMIN_REG_CODE"
              defaultValue={code ?? ""}
              autoComplete="one-time-code"
              required
            />
            {adminReady ? null : (
              <span className="hint">Admin sign-up is disabled until ADMIN_REG_CODE is set.</span>
            )}
          </div>

          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" autoComplete="name" required />
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
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete="new-password"
              minLength={12}
              required
            />
            <span className="hint">
              12+ characters, with at least three of: lower case, upper case, number, symbol.
            </span>
          </div>

          <SubmitButton className="btn btn-primary btn-block" pending="Creating…">
            Create account
          </SubmitButton>
        </form>

        <hr />
        <div className="stack-sm small">
          <Link href="/login" className="btn btn-secondary btn-block">
            Already have an account? Sign in
          </Link>
          <Link href="/">← Back to overview</Link>
        </div>
      </div>
    </div>
  );
}
