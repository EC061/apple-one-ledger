import { db, nowIso } from "./db";

export interface PlanSettings {
  name: string;
  timezone: string;
  seats: number;
  graceDays: number;
  dueSoonDays: number;
  /** What the plan includes; shown on the public page. */
  services: string[];
}

export interface PricingSettings {
  monthlyTotalUsd: number;
  firstTerm: { quarterly: number; semiannual: number; annual: number };
  renewal: { quarterly: number; semiannual: number; annual: number };
}

export interface PaymentSettings {
  venmoHandle: string;
  zelleEmail: string;
  wechatId: string;
  alipayId: string;
  wechatQrUrl: string;
  alipayQrUrl: string;
  instructions: string;
}

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface FxSettings {
  provider: "frankfurter" | "manual";
  manualRate: number | null;
  lastRefresh: string | null;
}

export interface ReminderSettings {
  enabled: boolean;
  daysBefore: number[];
  overdueEveryDays: number;
  adminDigest: boolean;
  removalWarningDays: number;
}

export interface AppSettings {
  /** Session + cookie lifetime. */
  sessionDays: number;
  /** How often the in-process scheduler runs. */
  schedulerHours: number;
  /** Rounding/transfer-fee tolerance before a payment counts as short. */
  paymentToleranceUsd: number;
}

export interface StorageSettings {
  enabled: boolean;
  totalGb: number;
  /** People actually sharing the Apple family pool (may differ from billing seats). */
  shareCount: number;
  warnPercent: number;
  /** Stop alerting on readings older than this. */
  maxAgeDays: number;
  notifyMember: boolean;
  notifyAdmin: boolean;
}

export interface Settings {
  plan: PlanSettings;
  pricing: PricingSettings;
  payments: PaymentSettings;
  smtp: SmtpSettings;
  fx: FxSettings;
  reminders: ReminderSettings;
  storage: StorageSettings;
  app: AppSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  plan: {
    name: "Apple One Premier + AppleCare One",
    timezone: "America/New_York",
    seats: 6,
    graceDays: 7,
    dueSoonDays: 7,
    services: [
      "Apple Music",
      "Apple TV+",
      "Apple Arcade",
      "Apple News+",
      "Apple Fitness+",
      "iCloud+ 2 TB",
      "AppleCare One",
    ],
  },
  pricing: {
    monthlyTotalUsd: 89.94,
    firstTerm: { quarterly: 45, semiannual: 90, annual: 180 },
    renewal: { quarterly: 51, semiannual: 96, annual: 180 },
  },
  payments: {
    venmoHandle: "",
    zelleEmail: "",
    wechatId: "",
    alipayId: "",
    wechatQrUrl: "",
    alipayQrUrl: "",
    instructions: "",
  },
  smtp: {
    enabled: false,
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    from: "",
  },
  fx: {
    provider: "frankfurter",
    manualRate: null,
    lastRefresh: null,
  },
  reminders: {
    enabled: true,
    daysBefore: [7, 3, 1],
    overdueEveryDays: 3,
    adminDigest: true,
    removalWarningDays: 7,
  },
  app: {
    sessionDays: 30,
    schedulerHours: 6,
    paymentToleranceUsd: 0.5,
  },
  storage: {
    enabled: true,
    totalGb: 2000,
    shareCount: 6,
    warnPercent: 90,
    maxAgeDays: 45,
    notifyMember: true,
    notifyAdmin: true,
  },
};

export type SettingsSection = keyof Settings;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function merge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T));
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (key in out) out[key] = merge((base as Record<string, unknown>)[key], value);
  }
  return out as T;
}

export function getSettings(): Settings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const stored: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      stored[row.key] = JSON.parse(row.value);
    } catch {
      /* corrupt row: ignore, fall back to defaults */
    }
  }
  const merged: Settings = { ...DEFAULT_SETTINGS };
  const target = merged as unknown as Record<string, unknown>;
  for (const section of Object.keys(DEFAULT_SETTINGS) as SettingsSection[]) {
    target[section] = merge<unknown>(DEFAULT_SETTINGS[section], stored[section]);
  }
  return merged;
}

export function saveSection<K extends SettingsSection>(section: K, value: Settings[K]) {
  db()
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(section, JSON.stringify(value), nowIso());
}

/** Persist a partial patch for one section without clobbering sibling keys. */
export function patchSection<K extends SettingsSection>(section: K, patch: Partial<Settings[K]>) {
  const current = getSettings()[section];
  const next = { ...current, ...patch } as Settings[K];
  saveSection(section, next);
  return next;
}

export function setSettingFlag(key: string, value: string) {
  db()
    .prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(key, JSON.stringify(value), nowIso());
}
