import Link from "next/link";
import { adminLoginAction } from "@/app/actions/auth";
import { adminCodeConfigured, getAdmin } from "@/lib/auth";
import { Notice } from "@/components/ui";
import SubmitButton from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That admin registration code is not correct.",
  notconfigured: "ADMIN_REG_CODE is not set on the server. Add it to your environment and restart.",
  rate: "Too many attempts. Wait 15 minutes and try again.",
  email: "Enter a valid email address.",
  claimed: "This deployment already has an admin with a different email address.",
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const admin = getAdmin();
  const configured = adminCodeConfigured();

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">A1</span>
          <div>
            <strong>Apple One Ledger</strong>
            <div className="muted small">Admin sign in</div>
          </div>
        </div>

        <h1 style={{ fontSize: 22 }}>{admin ? "Admin sign in" : "Claim this deployment"}</h1>
        <p className="muted small">
          {admin
            ? "Sign in with the admin code from your environment file."
            : "No admin exists yet. Use the registration code from ADMIN_REG_CODE to create the admin account."}
        </p>

        {error ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="error">{ERRORS[error] ?? "Something went wrong. Try again."}</Notice>
          </div>
        ) : null}

        {!configured ? (
          <div style={{ marginBottom: 14 }}>
            <Notice tone="warn">
              Set <span className="mono">ADMIN_REG_CODE</span> in the container environment to enable admin access.
            </Notice>
          </div>
        ) : null}

        <form action={adminLoginAction} className="stack-sm">
          <div className="field">
            <label className="label" htmlFor="email">
              Admin email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              defaultValue={admin?.email ?? ""}
              autoComplete="email"
              required
            />
          </div>

          {admin ? null : (
            <div className="field">
              <label className="label" htmlFor="name">
                Your name
              </label>
              <input id="name" name="name" className="input" placeholder="Family admin" />
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="code">
              Admin registration code
            </label>
            <input
              id="code"
              name="code"
              type="password"
              className="input mono"
              placeholder="ADMIN_REG_CODE"
              autoComplete="current-password"
              required
            />
            <span className="hint">Set in your environment as ADMIN_REG_CODE. Never stored in the database.</span>
          </div>

          <SubmitButton className="btn btn-primary btn-block" pending="Verifying…">
            {admin ? "Sign in as admin" : "Create admin account"}
          </SubmitButton>
        </form>

        <hr />
        <div className="row-between small">
          <Link href="/">← Back to overview</Link>
          <Link href="/login">Member sign in</Link>
        </div>
      </div>
    </div>
  );
}
