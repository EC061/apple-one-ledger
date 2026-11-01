"use server";

import { redirect } from "next/navigation";
import { db, newId, nowIso, event, tx } from "@/lib/db";
import {
  adminCodeConfigured,
  createAdmin,
  createSession,
  destroySession,
  generateCode,
  getAdmin,
  hashAccessCode,
  rateLimit,
  seatCapacity,
  seatsUsed,
  verifyAdminCode,
} from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { today } from "@/lib/dates";
import { sendAccessCodeEmail } from "@/lib/email";
import { setAccessCodeFlash } from "@/lib/flash";
import { getBaseUrl, requestMeta } from "@/lib/url";
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

/**
 * One entry point for everybody. The code decides what happens:
 *   1. ADMIN_REG_CODE          → admin sign-in, or admin account creation on first use
 *   2. a member access code    → member sign-in
 *   3. an unused invite code   → member account creation (name + email required)
 * Anything else is rejected. One page, no separate admin login.
 */
export async function unifiedAuthAction(formData: FormData) {
  const code = text(formData, "code");
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();

  // Two buckets: per-IP and a global cap that survives header rotation.
  if (!(await rateLimitAsync("auth"))) redirect("/login?error=rate");
  if (!rateLimit("auth:global", 150, 15 * 60_000)) redirect("/login?error=rate");
  if (!code) redirect("/login?error=empty");

  // 1. Admin code
  if (adminCodeConfigured() && verifyAdminCode(code)) {
    // Never reveal "the code was right but the email was wrong": both cases
    // return the same generic failure a wrong code does.
    if (!EMAIL.test(email)) redirect("/login?error=invalid");

    let admin = getAdmin();
    if (!admin) {
      admin = createAdmin(email, name || "Family admin");
      event(admin.id, "admin.created", { email });
    } else if (admin.email.toLowerCase() !== email) {
      redirect("/login?error=invalid");
    }

    await createSession(admin.id);
    event(admin.id, "auth.login", { role: "admin" });
    redirect("/admin");
  }

  // 2. Member access code
  const member = db()
    .prepare("SELECT * FROM users WHERE access_code_hash = ?")
    .get(hashAccessCode(code)) as unknown as User | undefined;

  if (member) {
    if (member.status !== "active") redirect("/login?error=removed");
    await createSession(member.id);
    event(member.id, "auth.login", { role: member.role });
    redirect(member.role === "admin" ? "/admin" : "/dashboard");
  }

  // 3. Invite code → create the member account
  const inviteCode = code.toUpperCase();
  const invite = db()
    .prepare("SELECT * FROM invites WHERE code = ?")
    .get(inviteCode) as unknown as Invite | undefined;

  if (!invite || invite.revoked_at) redirect("/login?error=invalid");
  if (invite.used_at) redirect("/login?error=used");

  const settings = getSettings();
  if (invite.expires_at && invite.expires_at < today(settings.plan.timezone)) {
    redirect("/login?error=expired");
  }
  if (name.length < 2 || name.length > 60) redirect("/login?error=name");
  if (!EMAIL.test(email)) redirect("/login?error=email");

  const accessCode = generateCode();
  const userId = newId();
  const now = nowIso();

  // Capacity, invite validity and member creation commit together: otherwise a
  // crash can leave an active member with a reusable invite.
  try {
    tx(() => {
      // Re-read inside the write lock: another process may have consumed the
      // invite or taken the last seat between the page load and this request.
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
          `INSERT INTO users (id, role, name, email, access_code_hash, status, created_at, updated_at)
           VALUES (?, 'member', ?, ?, ?, 'active', ?, ?)`,
        )
        .run(userId, name, email, hashAccessCode(accessCode), now, now);

      const consumed = db()
        .prepare(
          "UPDATE invites SET used_at = ?, used_by = ? WHERE code = ? AND used_at IS NULL AND revoked_at IS NULL",
        )
        .run(now, userId, inviteCode);
      if (Number(consumed.changes) !== 1) throw new Error("used");
    });
  } catch (error) {
    redirect(`/login?error=${encodeURIComponent((error as Error).message)}`);
  }

  event(userId, "invite.accepted", { invite: inviteCode, seats: settings.plan.seats });

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
  await createSession(userId);
  await setAccessCodeFlash(accessCode);
  await sendAccessCodeEmail(user, accessCode, await getBaseUrl()).catch(() => undefined);
  redirect("/dashboard?joined=1");
}

async function rateLimitAsync(prefix: string): Promise<boolean> {
  return rateLimit(await attemptKey(prefix), 12, 15 * 60_000);
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
