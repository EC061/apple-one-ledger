import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, newId, nowIso } from "./db";
import { getSettings } from "./settings";
import { isHttps, requestMeta } from "./url";
import type { User } from "./types";

export const SESSION_COOKIE = "a1_session";
const SESSION_DAYS = 30;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(groups = 4, size = 4): string {
  const bytes = new Uint8Array(groups * size);
  crypto.getRandomValues(bytes);
  let out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let chunk = "";
    for (let i = 0; i < size; i++) chunk += CODE_ALPHABET[bytes[g * size + i] % CODE_ALPHABET.length];
    out.push(chunk);
  }
  return out.join("-");
}

export function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function pepper(): string {
  const secret = process.env.SESSION_SECRET || "";
  if (secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-only-insecure-secret";
  throw new Error("SESSION_SECRET must be set to at least 32 characters before anyone can sign in.");
}

export function hashAccessCode(code: string): string {
  return createHash("sha256").update(`${pepper()}:${normalizeCode(code)}`).digest("hex");
}

export function sessionSecretOk(): boolean {
  return (process.env.SESSION_SECRET || "").length >= 32;
}

export function verifyAccessCode(code: string, hash: string | null): boolean {
  if (!hash) return false;
  const a = Buffer.from(hashAccessCode(code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function adminCodeConfigured(): boolean {
  return Boolean(process.env.ADMIN_REG_CODE && process.env.ADMIN_REG_CODE.length >= 6);
}

export function verifyAdminCode(input: string): boolean {
  const expected = process.env.ADMIN_REG_CODE;
  if (!expected || expected.length < 6) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const meta = await requestMeta();
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_DAYS * 86_400_000);

  db()
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(hashToken(token), userId, created.toISOString(), expires.toISOString(), meta.ip, meta.userAgent);

  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(created.toISOString());

  const secure = await isHttps();
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db()
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), nowIso()) as unknown as User | undefined;

  if (!row || row.status !== "active") return null;
  return row;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.role !== "admin") redirect("/dashboard");
  return user;
}

export async function revokeUserSessions(userId: string) {
  db().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function seatsUsed(): number {
  const row = db()
    .prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'active'")
    .get() as { n: number };
  return Number(row.n);
}

export function seatCapacity(): number {
  return Math.max(getSettings().plan.seats, 1);
}

/** First admin account, if one has been claimed yet. */
export function getAdmin(): User | null {
  return (
    (db()
      .prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1")
      .get() as unknown as User | undefined) ?? null
  );
}

export function createAdmin(email: string, name: string): User {
  const now = nowIso();
  const user: User = {
    id: newId(),
    role: "admin",
    name: name.trim() || "Family admin",
    email: email.trim().toLowerCase(),
    access_code_hash: null,
    status: "active",
    paid_through: null,
    note: null,
    storage_used_gb: 0,
    storage_updated_at: null,
    created_at: now,
    updated_at: now,
  };
  db()
    .prepare(
      `INSERT INTO users (id, role, name, email, access_code_hash, status, paid_through, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 'active', NULL, NULL, ?, ?)`,
    )
    .run(user.id, user.role, user.name, user.email, user.created_at, user.updated_at);
  return user;
}

/* ------------------------------------------------------------------ */
/* Simple in-process rate limiting (single container deployment).      */
/* ------------------------------------------------------------------ */

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit = 8, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
