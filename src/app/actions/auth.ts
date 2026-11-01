"use server";

import { redirect } from "next/navigation";
import { db, newId, nowIso, event, tx } from "@/lib/db";
import {
  adminCodeConfigured,
  createAdmin,
  createSession,
  destroySession,
  getAdmin,
  hashPassword,
  passwordProblem,
  rateLimit,
  seatCapacity,
  seatsUsed,
  verifyAdminCode,
  verifyPassword,
} from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/dates";
import { requestMeta } from "@/lib/url";
import type { Invite, User } from "@/lib/types";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function attemptKey(prefix: string): Promise<string> {
  const meta = await requestMeta();
  return `${prefix}:${meta.ip || "unknown"}`;
}

/** Email + password for members and admin. */
export async function loginAction(formData: FormData) {
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");

  if (!(await rateLimitAsync("login"))) redirect("/login?error=rate");
  if (!EMAIL.test(email) || !password) redirect("/login?error=invalid");

  const user = db()
    .prepare("SELECT * FROM users WHERE lower(email) = ?")
    .get(email) as unknown as User | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    redirect("/login?error=invalid");
  }
  if (user.status !== "active") redirect("/login?error=removed");

  await createSession(user.id);
  event(user.id, "auth.login", { role: user.role });
  redirect(user.role === "admin" ? "/admin" : "/dashboard");
}

/**
 * Account creation. The code decides the role:
 *   ADMIN_REG_CODE     → create the admin, or reset its password if the email matches
 *   an unused invite   → create a member
 * Email and a strong password are set here; the invite itself is never a login credential.
 */
export async function signupAction(formData: FormData) {
  const code = text(formData, "code");
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const password = text(formData, "password");

  if (!(await rateLimitAsync("signup"))) redirect("/signup?error=rate");
  if (!code) redirect("/signup?error=empty");
  if (!EMAIL.test(email)) redirect("/signup?error=email");
  if (name.length < 2 || name.length > 60) redirect("/signup?error=name");

  const weak = passwordProblem(password);
  if (weak) redirect("/signup?error=weak");

  // Admin account creation / password recovery.
  if (adminCodeConfigured() && verifyAdminCode(code)) {
    let admin = getAdmin();
    if (!admin) {
      admin = createAdmin(email, name, password);
      event(admin.id, "admin.created", { email });
    } else if (admin.email.toLowerCase() !== email) {
      redirect("/signup?error=invalid");
    } else {
      db()
        .prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .run(hashPassword(password), nowIso(), admin.id);
      event(admin.id, "admin.password_reset", { email });
    }

    await createSession(admin.id);
    redirect("/admin");
  }

  // Member account creation from an invite.
  const inviteCode = code.toUpperCase();
  const invite = db()
    .prepare("SELECT * FROM invites WHERE code = ?")
    .get(inviteCode) as unknown as Invite | undefined;

  if (!invite || invite.revoked_at) redirect("/signup?error=invalid");
  if (invite.used_at) redirect("/signup?error=used");

  const settings = getSettings();
  if (invite.expires_at && invite.expires_at < today(settings.plan.timezone)) {
    redirect("/signup?error=expired");
  }

  const userId = newId();
  const now = nowIso();
  const passwordHash = hashPassword(password);

  try {
    tx(() => {
      const fresh = db()
        .prepare("SELECT * FROM invites WHERE code = ?")
        .get(inviteCode) as unknown as Invite | undefined;
      if (!fresh || fresh.revoked_at) throw new Error("invalid");
      if (fresh.used_at) throw new Error("used");
      if (fresh.expires_at && fresh.expires_at < today(settings.plan.timezone)) throw new Error("expired");
      if (seatsUsed() >= seatCapacity()) throw new Error("full");
      if (db().prepare("SELECT 1 FROM users WHERE lower(email) = ?").get(email)) throw new Error("exists");

      db()
        .prepare(
          `INSERT INTO users (id, role, name, email, access_code_hash, password_hash, status, created_at, updated_at)
           VALUES (?, 'member', ?, ?, NULL, ?, 'active', ?, ?)`,
        )
        .run(userId, name, email, passwordHash, now, now);

      const consumed = db()
        .prepare(
          "UPDATE invites SET used_at = ?, used_by = ? WHERE code = ? AND used_at IS NULL AND revoked_at IS NULL",
        )
        .run(now, userId, inviteCode);
      if (Number(consumed.changes) !== 1) throw new Error("used");
    });
  } catch (error) {
    redirect(`/signup?error=${encodeURIComponent((error as Error).message)}`);
  }

  event(userId, "invite.accepted", { invite: inviteCode, seats: settings.plan.seats });
  await createSession(userId);
  redirect("/dashboard?joined=1");
}

async function rateLimitAsync(prefix: string): Promise<boolean> {
  const perIp = rateLimit(await attemptKey(prefix), 12, 15 * 60_000);
  const global = rateLimit(`${prefix}:global`, 150, 15 * 60_000);
  return perIp && global;
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function logoutAllAction() {
  const { getCurrentUser, revokeUserSessions } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await revokeUserSessions(user.id);
  await destroySession();
  redirect("/login");
}
