import { db, nowIso, event } from "./db";
import { getSettings } from "./settings";
import { daysBetween, today } from "./dates";
import { sendStorageAlertEmail } from "./email";
import { getBaseUrl } from "./url";
import type { Settings } from "./settings";
import type { User } from "./types";

/** Per-seat slice of the shared iCloud+ pool (2 TB ÷ 6 ≈ 333 GB). */
export function quotaGb(settings: Settings = getSettings()): number {
  return settings.storage.totalGb / Math.max(settings.plan.seats, 1);
}

export function percentUsed(usedGb: number, quota: number): number {
  if (quota <= 0) return 0;
  return (usedGb / quota) * 100;
}

export interface StorageStatus {
  usedGb: number;
  quotaGb: number;
  percent: number;
  over: boolean;
  updatedAt: string | null;
}

export function statusFor(user: Pick<User, "storage_used_gb" | "storage_updated_at">, settings = getSettings()): StorageStatus {
  const quota = quotaGb(settings);
  const used = Number(user.storage_used_gb || 0);
  return {
    usedGb: used,
    quotaGb: quota,
    percent: percentUsed(used, quota),
    over: used > quota,
    updatedAt: user.storage_updated_at,
  };
}

export function updateStorage(userId: string, usedGb: number, actor: string | null): StorageStatus {
  const settings = getSettings();
  const value = Math.max(0, Math.min(usedGb, settings.storage.totalGb));
  db()
    .prepare("UPDATE users SET storage_used_gb = ?, storage_updated_at = ?, updated_at = ? WHERE id = ?")
    .run(value, nowIso(), nowIso(), userId);
  event(actor, "storage.updated", { userId, usedGb: value });

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
  return statusFor(user, settings);
}

function weekKey(day: string): string {
  return String(Math.floor(daysBetween("2020-01-01", day) / 7));
}

/**
 * Alert members (and the admin) when someone exceeds their share of the pool.
 * Member mail is throttled to once per week per member; the admin gets one
 * summary per day.
 */
export async function checkStorage(day = today(getSettings().plan.timezone)): Promise<{ over: number; sent: number }> {
  const settings = getSettings();
  if (!settings.storage.enabled) return { over: 0, sent: 0 };

  const users = db().prepare("SELECT * FROM users WHERE status = 'active'").all() as unknown as User[];
  const over = users.filter((user) => statusFor(user, settings).over);
  if (over.length === 0) return { over: 0, sent: 0 };

  const baseUrl = await getBaseUrl();
  const admin = users.find((user) => user.role === "admin") ?? null;
  let sent = 0;

  if (settings.storage.notifyMember) {
    for (const user of over) {
      const status = statusFor(user, settings);
      const result = await sendStorageAlertEmail({
        user,
        quotaGb: status.quotaGb,
        usedGb: status.usedGb,
        totalGb: settings.storage.totalGb,
        baseUrl,
        audience: "member",
        dedupeKey: `storage-member:${user.id}:${weekKey(day)}`,
      });
      if (result.status === "sent") sent += 1;
    }
  }

  if (settings.storage.notifyAdmin && admin) {
    const rows = over.map((user) => ({ user, status: statusFor(user, settings) }));
    const result = await sendStorageAlertEmail({
      user: admin,
      quotaGb: quotaGb(settings),
      usedGb: rows.reduce((sum, row) => sum + row.status.usedGb, 0),
      totalGb: settings.storage.totalGb,
      baseUrl,
      audience: "admin",
      overUsers: rows.map((row) => ({
        name: row.user.name,
        email: row.user.email,
        usedGb: row.status.usedGb,
        quotaGb: row.status.quotaGb,
      })),
      dedupeKey: `storage-admin:${day}`,
    });
    if (result.status === "sent") sent += 1;
  }

  event(null, "storage.checked", { over: over.length, sent });
  return { over: over.length, sent };
}

export function storageTotals() {
  const settings = getSettings();
  const row = db()
    .prepare("SELECT COALESCE(SUM(storage_used_gb),0) AS used, COUNT(*) AS people FROM users WHERE status = 'active'")
    .get() as { used: number; people: number };
  return {
    usedGb: Number(row.used),
    people: Number(row.people),
    totalGb: settings.storage.totalGb,
    quotaGb: quotaGb(settings),
    percent: (Number(row.used) / Math.max(settings.storage.totalGb, 1)) * 100,
  };
}
