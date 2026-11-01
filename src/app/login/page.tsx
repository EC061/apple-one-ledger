import Link from "next/link";
import type { Metadata } from "next";
import { loginAction } from "@/app/actions/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in with your email and password.",
};

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "Email or password is not correct.",
  removed: "This seat has been removed. Contact the admin.",
  rate: "Too many attempts. Wait 15 minutes.",
  empty: "Enter your email and password.",
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
            <div className="muted small">Sign in</div>
          </div>
        </div>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        <h1 style={{ fontSize: 22 }}>Welcome back</h1>
        <p className="muted small">Members and admin sign in with email and password.</p>

        <form action={loginAction} className="stack-sm">
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input id="email" name="email" type="email" className="input" autoComplete="username" required />
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
              autoComplete="current-password"
              required
            />
          </div>
          <SubmitButton className="btn btn-primary btn-block" pending="Signing in…">
            Sign in
          </SubmitButton>
        </form>

        <hr />
        <div className="stack-sm small">
          <Link href="/signup" className="btn btn-secondary btn-block">
            Create an account
          </Link>
          <div className="row-between">
            <Link href="/">← Back to overview</Link>
            <Link href="/signup">Have an invite code?</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
