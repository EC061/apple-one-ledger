import Link from "next/link";
import type { Metadata } from "next";
import { unifiedAuthAction } from "@/app/actions/auth";
import { adminCodeConfigured } from "@/lib/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create your account with an access, invite or admin code.",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  empty: "Enter your code.",
  invalid: "That code was not recognised.",
  removed: "This seat has been removed. Contact the admin.",
  rate: "Too many attempts. Wait 15 minutes.",
  email: "Enter a valid email address.",
  "admin-email": "Admin sign-in needs the admin email address.",
  name: "Enter your name (2–60 characters) to create an account.",
  claimed: "This deployment already has an admin with a different email.",
  used: "That invite has already been used.",
  expired: "That invite has expired.",
  full: "All seats are taken.",
  exists: "That email already has an account — sign in with its access code.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const { error, code } = await searchParams;
  const adminReady = adminCodeConfigured();

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 470 }}>
        <div className="auth-brand">
          <span className="brand-mark">A1</span>
          <div>
            <strong>Apple One Ledger</strong>
            <div className="muted small">Members and admin · one page</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22 }}>Continue with your code</h1>
        <p className="muted small">
          The same field works for members, new invites and the admin. What happens next depends on
          the code you enter.
        </p>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        <form action={unifiedAuthAction} className="stack-sm">
          <div className="field">
            <label className="label" htmlFor="code">
              Access, invite or admin code
            </label>
            <input
              id="code"
              name="code"
              className="input mono"
              placeholder="XXXX-XXXX-XXXX-XXXX"
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              defaultValue={code ?? ""}
              required
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" placeholder="Only for a new account" autoComplete="name" />
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
                placeholder="Admin or new invite"
                autoComplete="email"
              />
            </div>
          </div>

          <SubmitButton className="btn btn-primary btn-block" pending="Checking…">
            Continue
          </SubmitButton>
        </form>

        <div className="notice small" style={{ marginTop: 14 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <strong>Member:</strong> your saved access code — name and email can stay empty.
            </li>
            <li>
              <strong>New member:</strong> the invite code, plus your name and email.
            </li>
            <li>
              <strong>Admin:</strong> the <span className="mono">ADMIN_REG_CODE</span> and the admin email.
              {adminReady ? "" : " Admin sign-in is disabled until that variable is set."}
            </li>
          </ul>
        </div>

        <hr />
        <div className="row-between small">
          <Link href="/">← Back to overview</Link>
          <Link href="/#how-it-works">How it works</Link>
        </div>
      </div>
    </div>
  );
}
