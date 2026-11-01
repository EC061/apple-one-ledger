import { db, newId, nowIso, event } from "./db";
import { getSettings } from "./settings";
import { daysBetween, parseDate, today } from "./dates";
import { sendStorageAlertEmail } from "./email";
import { getBaseUrl } from "./url";
import type { Settings } from "./settings";
import type { User } from "./types";

export class StorageError extends Error {}

/**
 * Fair-share size of one seat in the shared iCloud+ pool.
 *
 * `shareCount` is separate from billing seats on purpose: a billing-only admin
 * who is not in the Apple family should not shrink everyone else's share.
 */
export function quotaGb(settings: Settings = getSettings()): number {
  const people = settings.storage.shareCount > 0 ? settings.storage.shareCount : settings.plan.seats;
  return settings.storage.totalGb / Math.max(people, 1);
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
  reported: boolean;
  stale: boolean;
  updatedAt: string | null;
}

export function statusFor(
  user: Pick<User, "storage_used_gb" | "storage_updated_at">,
  settings = getSettings(),
  day = today(settings.plan.timezone),
): StorageStatus {
  const quota = quotaGb(settings);
  const used = Number(user.storage_used_gb || 0);
  const updatedAt = user.storage_updated_at;
  const age = updatedAt ? daysBetween(updatedAt.slice(0, 10), day) : null;

  return {
    usedGb: used,
    quotaGb: quota,
    percent: percentUsed(used, quota),
    over: used > quota,
    reported: Boolean(updatedAt),
    stale: age === null ? true : age > settings.storage.maxAgeDays,
    updatedAt,
  };
}

export function updateStorage(userId: string, usedGb: number, actor: string | null, source = "manual"): StorageStatus {
  const settings = getSettings();
  if (!Number.isFinite(usedGb) || usedGb < 0) {
    throw new StorageError("Storage usage must be a number of GB, 0 or more.");
  }
  if (usedGb > settings.storage.totalGb) {
    throw new StorageError(
      `Usage (${usedGb} GB) cannot exceed the whole pool (${settings.storage.totalGb} GB). Check units.`,
    );
  }

  const exists = db().prepare("SELECT 1 FROM users WHERE id = ?").get(userId);
  if (!exists) throw new StorageError("Member not found.");

  const at = nowIso();
  db().prepare("UPDATE users SET storage_used_gb = ?, storage_updated_at = ?, updated_at = ? WHERE id = ?").run(
    usedGb,
    at,
    at,
    userId,
  );
  db()
    .prepare("INSERT INTO storage_readings (id, user_id, used_gb, source, actor, recorded_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(newId(), userId, usedGb, source, actor, at);

  event(actor, "storage.updated", { userId, usedGb, source });

  const user = db().prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
  return statusFor(user, settings);
}

/** ISO-8601 week key, so "once a week" cannot fire twice at a bucket edge. */
function isoWeekKey(day: string): string {
  const date = parseDate(day);
  const target = new Date(date.getTime());
  const dayNumber = (date.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7,
    );
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Alert members (and the admin) when someone exceeds their fair share.
 *
 * - stale or never-reported values are ignored, so nobody is emailed about
 *   numbers that were true three months ago;
 * - member mail is capped at one per ISO week, admin summary at one per day;
 * - the admin does not receive the member copy of their own alert.
 */
export async function checkStorage(day = today(getSettings().plan.timezone)): Promise<{ over: number; sent: number }> {
  const settings = getSettings();
  if (!settings.storage.enabled) return { over: 0, sent: 0 };

  const users = db().prepare("SELECT * FROM users WHERE status = 'active'").all() as unknown as User[];
  const measured = users
    .map((user) => ({ user, status: statusFor(user, settings, day) }))
    .filter((row) => row.status.reported && !row.status.stale);

  const over = measured.filter((row) => row.status.over);
  if (over.length === 0) return { over: 0, sent: 0 };

  const baseUrl = await getBaseUrl();
  const admin = users.find((user) => user.role === "admin") ?? null;
  let sent = 0;

  if (settings.storage.notifyMember) {
    for (const row of over) {
      if (row.user.role === "admin") continue; // the summary below covers the admin
      const result = await sendStorageAlertEmail({
        user: row.user,
        quotaGb: row.status.quotaGb,
        usedGb: row.status.usedGb,
        totalGb: settings.storage.totalGb,
        baseUrl,
        audience: "member",
        dedupeKey: `storage-member:${row.user.id}:${isoWeekKey(day)}`,
      });
      if (result.status === "sent") sent += 1;
    }
  }

  if (settings.storage.notifyAdmin && admin) {
    const result = await sendStorageAlertEmail({
      user: admin,
      quotaGb: quotaGb(settings),
      usedGb: over.reduce((sum, row) => sum + row.status.usedGb, 0),
      totalGb: settings.storage.totalGb,
      baseUrl,
      audience: "admin",
      overUsers: over.map((row) => ({
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

export function storageTotals(day = today(getSettings().plan.timezone)) {
  const settings = getSettings();
  const rows = db()
    .prepare("SELECT storage_used_gb, storage_updated_at FROM users WHERE status = 'active'")
    .all() as unknown as Pick<User, "storage_used_gb" | "storage_updated_at">[];
  const statuses = rows.map((row) => statusFor(row, settings, day));
  const usedGb = statuses.reduce((sum, status) => sum + status.usedGb, 0);
  const reported = statuses.filter((status) => status.reported).length;

  return {
    usedGb,
    people: rows.length,
    reported,
    totalGb: settings.storage.totalGb,
    quotaGb: quotaGb(settings),
    percent: (usedGb / Math.max(settings.storage.totalGb, 1)) * 100,
  };
}
