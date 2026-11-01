import Link from "next/link";
import type { Metadata } from "next";
import { loginAction, signupAction } from "@/app/actions/auth";
import { adminCodeConfigured } from "@/lib/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in or create your family plan account with email and password.",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Email or password is not correct.",
  removed: "This seat has been removed. Contact the admin.",
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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; code?: string; signup?: string }>;
}) {
  const { error, code, signup } = await searchParams;
  const adminReady = adminCodeConfigured();
  const createFirst = Boolean(signup || code);

  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="auth-brand">
          <span className="brand-mark">A1</span>
          <div>
            <strong>Apple One Ledger</strong>
            <div className="muted small">Members and admin</div>
          </div>
        </div>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        {createFirst ? (
          <>
            <CreateAccount code={code} adminReady={adminReady} />
            <hr />
            <SignIn />
          </>
        ) : (
          <>
            <SignIn />
            <hr />
            <CreateAccount code={code} adminReady={adminReady} />
          </>
        )}

        <hr />
        <div className="row-between small">
          <Link href="/">← Back to overview</Link>
          <Link href="/#how-it-works">How it works</Link>
        </div>
      </div>
    </div>
  );
}

function SignIn() {
  return (
    <>
      <h1 style={{ fontSize: 22 }}>Sign in</h1>
      <p className="muted small">Your email and password. Admin signs in the same way.</p>
      <form action={loginAction} className="stack-sm">
        <div className="field">
          <label className="label" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            className="input"
            autoComplete="username"
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
          />
        </div>
        <SubmitButton className="btn btn-primary btn-block" pending="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </>
  );
}

function CreateAccount({ code, adminReady }: { code?: string; adminReady: boolean }) {
  return (
    <>
      <h1 style={{ fontSize: 22 }}>Create an account</h1>
      <p className="muted small">
        An invite code creates a member. The admin registration code creates (or recovers) the admin.
        You choose the email and password used to sign in from now on.
      </p>
      <form action={signupAction} className="stack-sm">
        <div className="field">
          <label className="label" htmlFor="signup-code">
            Invite or admin code
          </label>
          <input
            id="signup-code"
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
            <label className="label" htmlFor="signup-name">
              Name
            </label>
            <input id="signup-name" name="name" className="input" autoComplete="name" required />
          </div>
          <div className="field">
            <label className="label" htmlFor="signup-email">
              Email
            </label>
            <input
              id="signup-email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
            />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={12}
            required
          />
          <span className="hint">12+ characters, with at least three of: lower case, upper case, number, symbol.</span>
        </div>
        <SubmitButton className="btn btn-primary btn-block" pending="Creating…">
          Create account
        </SubmitButton>
      </form>
    </>
  );
}
