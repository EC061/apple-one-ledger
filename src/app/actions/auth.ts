"use server";

import { redirect } from "next/navigation";
import { db, newId, nowIso, event } from "@/lib/db";
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
import { sendAccessCodeEmail } from "@/lib/email";
import { setAccessCodeFlash } from "@/lib/flash";
import { getBaseUrl, requestMeta } from "@/lib/url";
import type { Invite, User } from "@/lib/types";

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function attemptKey(prefix: string): Promise<{ key: string }> {
  const meta = await requestMeta();
  return { key: `${prefix}:${meta.ip || "unknown"}` };
}

export async function loginAction(formData: FormData) {
  const code = text(formData, "code");
  const limit = await attemptKey("login");
  if (!rateLimit(limit.key, 10, 15 * 60_000)) {
    redirect("/login?error=rate");
  }
  if (!code) redirect("/login?error=empty");

  const user = db()
    .prepare("SELECT * FROM users WHERE access_code_hash = ?")
    .get(hashAccessCode(code)) as unknown as User | undefined;

  if (!user) redirect("/login?error=invalid");
  if (user.status !== "active") redirect("/login?error=removed");

  await createSession(user.id);
  event(user.id, "auth.login", { role: user.role });
  redirect(user.role === "admin" ? "/admin" : "/dashboard");
}

export async function adminLoginAction(formData: FormData) {
  const code = text(formData, "code");
  const email = text(formData, "email").toLowerCase();
  const name = text(formData, "name");

  if (!adminCodeConfigured()) redirect("/admin/login?error=notconfigured");

  const limit = await attemptKey("admin-login");
  if (!rateLimit(limit.key, 8, 15 * 60_000)) redirect("/admin/login?error=rate");
  if (!verifyAdminCode(code)) redirect("/admin/login?error=invalid");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect("/admin/login?error=email");

  let admin = getAdmin();
  if (!admin) {
    admin = createAdmin(email, name || "Family admin");
    event(admin.id, "admin.created", { email });
  } else if (admin.email.toLowerCase() !== email) {
    redirect("/admin/login?error=claimed");
  }

  await createSession(admin.id);
  event(admin.id, "auth.login", { role: "admin" });
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function joinAction(formData: FormData) {
  const code = text(formData, "code").toUpperCase();
  const name = text(formData, "name");
  const email = text(formData, "email").toLowerCase();
  const back = `/join/${encodeURIComponent(code)}`;

  const limit = await attemptKey("join");
  if (!rateLimit(limit.key, 12, 60 * 60_000)) redirect(`${back}?error=rate`);

  const invite = db().prepare("SELECT * FROM invites WHERE code = ?").get(code) as unknown as Invite | undefined;
  if (!invite || invite.revoked_at) redirect("/login?error=invite");
  if (invite.used_at) redirect("/login?error=used");
  if (invite.expires_at && invite.expires_at < new Date().toISOString().slice(0, 10)) {
    redirect("/login?error=expired");
  }

  if (name.length < 2 || name.length > 60) redirect(`${back}?error=name`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect(`${back}?error=email`);

  const settings = getSettings();
  if (seatsUsed() >= seatCapacity()) redirect(`${back}?error=full`);

  const existing = db().prepare("SELECT 1 FROM users WHERE lower(email) = ?").get(email);
  if (existing) redirect(`${back}?error=exists`);

  const accessCode = generateCode();
  const userId = newId();
  const now = nowIso();

  try {
    db()
      .prepare(
        `INSERT INTO users (id, role, name, email, access_code_hash, status, created_at, updated_at)
         VALUES (?, 'member', ?, ?, ?, 'active', ?, ?)`,
      )
      .run(userId, name, email, hashAccessCode(accessCode), now, now);
    db()
      .prepare("UPDATE invites SET used_at = ?, used_by = ? WHERE code = ?")
      .run(now, userId, code);
  } catch {
    redirect(`${back}?error=exists`);
  }

  event(userId, "invite.accepted", { invite: code, seats: settings.plan.seats });

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
  await createSession(userId);
  await setAccessCodeFlash(accessCode);
  await sendAccessCodeEmail(user, accessCode, await getBaseUrl()).catch(() => undefined);
  redirect("/dashboard?joined=1");
}

export async function logoutAllAction() {
  const { getCurrentUser, revokeUserSessions } = await import("@/lib/auth");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await revokeUserSessions(user.id);
  await destroySession();
  redirect("/login");
}
