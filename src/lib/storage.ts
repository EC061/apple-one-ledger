import { db, newId, nowIso, event, tx } from "./db";
import { createHash } from "node:crypto";
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
    const recipients = over.filter((row) => row.user.role !== "admin");
    const results = await Promise.all(
      recipients.map((row) =>
        sendStorageAlertEmail({
          user: row.user,
          quotaGb: row.status.quotaGb,
          usedGb: row.status.usedGb,
          totalGb: settings.storage.totalGb,
          baseUrl,
          audience: "member",
          dedupeKey: `storage-member:${row.user.id}:${isoWeekKey(day)}`,
        }),
      ),
    );
    sent += results.filter((result) => result.status === "sent").length;
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

/* ------------------------------------------------------------------ */
/* Batch observations                                                  */
/* ------------------------------------------------------------------ */

export class StorageConflictError extends Error {}

export interface ObservationReading {
  memberId?: string;
  email?: string;
  usedGb: number;
}

export interface ObservationInput {
  observationId: string;
  observedAt: string;
  source?: string;
  readings: ObservationReading[];
}

export interface ObservationResult {
  observationId: string;
  duplicate: boolean;
  applied: number;
  skipped: { reading: ObservationReading; reason: string }[];
}

/**
 * Record one batch of per-member readings (e.g. from an iOS Shortcut that OCRs
 * the Family Sharing screen). Idempotent: replaying the same observationId with
 * the same payload returns `duplicate: true`; reusing it with different values
 * throws StorageConflictError.
 */
export function recordObservation(input: ObservationInput, actor: string | null): ObservationResult {
  const settings = getSettings();
  if (!settings.storage.enabled) throw new StorageError("Storage tracking is disabled in settings.");
  if (!/^[A-Za-z0-9._:-]{8,80}$/.test(input.observationId)) {
    throw new StorageError("observationId must be 8–80 characters of [A-Za-z0-9._:-].");
  }
  if (!Array.isArray(input.readings) || input.readings.length === 0) {
    throw new StorageError("At least one reading is required.");
  }

  const payload = JSON.stringify({
    observedAt: input.observedAt,
    source: input.source ?? "unknown",
    readings: input.readings,
  });
  const fingerprint = createHash("sha256").update(payload).digest("hex");

  const existing = db()
    .prepare("SELECT payload FROM storage_observations WHERE id = ?")
    .get(input.observationId) as { payload: string } | undefined;
  if (existing) {
    if (existing.payload === fingerprint) {
      return { observationId: input.observationId, duplicate: true, applied: 0, skipped: [] };
    }
    throw new StorageConflictError("observationId was already used with different readings.");
  }

  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) throw new StorageError("observedAt must be an ISO-8601 timestamp.");
  if (observedAt.getTime() > Date.now() + 10 * 60_000) {
    throw new StorageError("observedAt cannot be in the future.");
  }

  const skipped: ObservationResult["skipped"] = [];
  let applied = 0;

  tx(() => {
    db()
      .prepare("INSERT INTO storage_observations (id, source, observed_at, payload, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(
        input.observationId,
        input.source ?? "unknown",
        observedAt.toISOString(),
        fingerprint,
        nowIso(),
      );

    for (const reading of input.readings) {
      const user = (
        reading.memberId
          ? db().prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").get(reading.memberId)
          : db()
              .prepare("SELECT * FROM users WHERE lower(email) = ? AND status = 'active'")
              .get((reading.email || "").toLowerCase())
      ) as unknown as User | undefined;

      if (!user) {
        skipped.push({ reading, reason: "member not found" });
        continue;
      }
      if (!Number.isFinite(reading.usedGb) || reading.usedGb < 0 || reading.usedGb > settings.storage.totalGb) {
        skipped.push({ reading, reason: "usedGb out of range" });
        continue;
      }

      const current = user.storage_updated_at ? new Date(user.storage_updated_at) : null;
      if (current && current.getTime() > observedAt.getTime()) {
        skipped.push({ reading, reason: "older than the current reading" });
        continue;
      }

      db()
        .prepare("UPDATE users SET storage_used_gb = ?, storage_updated_at = ?, updated_at = ? WHERE id = ?")
        .run(reading.usedGb, observedAt.toISOString(), nowIso(), user.id);
      db()
        .prepare("INSERT INTO storage_readings (id, user_id, used_gb, source, actor, recorded_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(newId(), user.id, reading.usedGb, `observation:${input.observationId}`, actor, observedAt.toISOString());
      applied += 1;
    }
  });

  event(actor, "storage.observation", { observationId: input.observationId, applied, skipped: skipped.length });
  return { observationId: input.observationId, duplicate: false, applied, skipped };
}
