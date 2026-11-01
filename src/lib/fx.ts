import { db, nowIso } from "./db";
import { getSettings, patchSection } from "./settings";
import { today } from "./dates";
import type { FxRate } from "./types";

const FALLBACK_RATE = 7;

export interface CurrentRate {
  rate: number;
  date: string;
  source: string;
  stale: boolean;
}

function saveRate(rate: number, date: string, source: string): FxRate {
  const row: FxRate = { date, rate, source, fetched_at: nowIso() };
  db()
    .prepare(
      "INSERT INTO fx_rates (date, rate, source, fetched_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(date) DO UPDATE SET rate = excluded.rate, source = excluded.source, fetched_at = excluded.fetched_at",
    )
    .run(row.date, row.rate, row.source, row.fetched_at);
  patchSection("fx", { lastRefresh: row.fetched_at });
  return row;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "applecare-one-tracker/1.0" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the latest USD -> CNY reference rate.
 * Primary source: frankfurter.app (ECB data, no API key). Fallback: open.er-api.com.
 */
export async function refreshRate(): Promise<FxRate> {
  try {
    const data = (await fetchJson("https://api.frankfurter.app/latest?from=USD&to=CNY")) as {
      date?: string;
      rates?: { CNY?: number };
    };
    const rate = Number(data?.rates?.CNY);
    if (Number.isFinite(rate) && rate > 0) {
      return saveRate(rate, data.date || today(), "frankfurter");
    }
    throw new Error("Missing CNY rate in frankfurter response");
  } catch (primaryError) {
    try {
      const data = (await fetchJson("https://open.er-api.com/v6/latest/USD")) as {
        time_last_update_unix?: number;
        rates?: { CNY?: number };
      };
      const rate = Number(data?.rates?.CNY);
      if (Number.isFinite(rate) && rate > 0) {
        const date = data.time_last_update_unix
          ? new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10)
          : today();
        return saveRate(rate, date, "open.er-api.com");
      }
      throw new Error("Missing CNY rate in fallback response");
    } catch {
      throw new Error(
        `Could not fetch USD/CNY rate (${(primaryError as Error).message}). Set a manual rate in admin settings.`,
      );
    }
  }
}

export function latestStoredRate(): FxRate | null {
  return (
    (db().prepare("SELECT * FROM fx_rates ORDER BY date DESC LIMIT 1").get() as unknown as FxRate | undefined) ?? null
  );
}

/** Rate used for new invoices: manual override, fresh daily rate, or last known value. */
export async function getCurrentRate(): Promise<CurrentRate> {
  const settings = getSettings();
  if (settings.fx.provider === "manual" && settings.fx.manualRate && settings.fx.manualRate > 0) {
    return { rate: settings.fx.manualRate, date: today(settings.plan.timezone), source: "manual", stale: false };
  }

  const stored = latestStoredRate();
  if (stored && stored.date >= today()) {
    return { rate: stored.rate, date: stored.date, source: stored.source || "stored", stale: false };
  }

  try {
    const fresh = await refreshRate();
    return { rate: fresh.rate, date: fresh.date, source: fresh.source || "frankfurter", stale: false };
  } catch {
    if (stored && stored.rate > 0) {
      return { rate: stored.rate, date: stored.date, source: stored.source || "stored", stale: true };
    }
    return { rate: FALLBACK_RATE, date: today(), source: "fallback", stale: true };
  }
}

export function rateForDate(date: string): FxRate | null {
  return (
    (db().prepare("SELECT * FROM fx_rates WHERE date <= ? ORDER BY date DESC LIMIT 1").get(date) as
      | FxRate
      | undefined) ?? null
  );
}
