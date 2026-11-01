import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export type SqlValue = string | number | bigint | null | Uint8Array;

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, "applecare.db");

declare global {
  // eslint-disable-next-line no-var
  var __a1db: DatabaseSync | undefined;
}

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const database = new DatabaseSync(DB_PATH);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
  `);
  migrate(database);
  return database;
}

/**
 * Single shared connection. Next.js dev mode re-evaluates modules between HMR
 * cycles, so we cache the handle on globalThis to avoid leaking connections.
 */
export function db(): DatabaseSync {
  if (!globalThis.__a1db) {
    globalThis.__a1db = open();
  }
  return globalThis.__a1db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY,
  role             TEXT NOT NULL CHECK (role IN ('admin','member')),
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  access_code_hash TEXT,
  password_hash    TEXT,
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  paid_through     TEXT,
  note             TEXT,
  storage_used_gb  REAL NOT NULL DEFAULT 0,
  storage_updated_at TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  label      TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  used_at    TEXT,
  used_by    TEXT REFERENCES users(id),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  plan         TEXT NOT NULL CHECK (plan IN ('quarterly','semiannual','annual')),
  term_index   INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  due_date     TEXT NOT NULL,
  amount_usd   REAL NOT NULL,
  fx_rate      REAL NOT NULL,
  fx_date      TEXT NOT NULL,
  amount_cny   REAL NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('awaiting_payment','submitted','paid','overdue','void')),
  reference    TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  submitted_at TEXT,
  paid_at      TEXT,
  method       TEXT,
  payer_note   TEXT,
  verified_by  TEXT,
  voided_at    TEXT
);
CREATE INDEX IF NOT EXISTS invoices_user ON invoices(user_id);
CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_open_per_user
  ON invoices(user_id) WHERE status IN ('awaiting_payment','submitted','overdue');

CREATE TABLE IF NOT EXISTS payments (
  id          TEXT PRIMARY KEY,
  invoice_id  TEXT NOT NULL REFERENCES invoices(id),
  method      TEXT NOT NULL,
  currency    TEXT NOT NULL CHECK (currency IN ('USD','CNY')),
  amount      REAL NOT NULL,
  amount_usd  REAL,
  fx_rate     REAL,
  fx_date     TEXT,
  tx_ref      TEXT,
  source      TEXT NOT NULL,
  raw         TEXT,
  status      TEXT NOT NULL CHECK (status IN ('pending','confirmed','rejected')),
  created_at  TEXT NOT NULL,
  confirmed_at TEXT
);
CREATE INDEX IF NOT EXISTS payments_invoice ON payments(invoice_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_tx_unique
  ON payments(tx_ref) WHERE tx_ref IS NOT NULL AND tx_ref <> '';

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS storage_readings (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_gb     REAL NOT NULL,
  source      TEXT NOT NULL,
  actor       TEXT,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS storage_readings_user ON storage_readings(user_id, recorded_at);

CREATE TABLE IF NOT EXISTS fx_rates (
  date       TEXT PRIMARY KEY,
  rate       REAL NOT NULL,
  source     TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS emails (
  id         TEXT PRIMARY KEY,
  to_addr    TEXT NOT NULL,
  subject    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  status     TEXT NOT NULL,
  error      TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS emails_created ON emails(created_at);

CREATE TABLE IF NOT EXISTS events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  actor  TEXT,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS events_at ON events(at);
`;

function migrate(database: DatabaseSync) {
  database.exec(SCHEMA);
  // Additive upgrades for databases created by older builds.
  ensureColumn(database, "users", "password_hash", "TEXT");
  ensureColumn(database, "users", "storage_used_gb", "REAL NOT NULL DEFAULT 0");
  ensureColumn(database, "users", "storage_updated_at", "TEXT");
}

function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((entry) => entry.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

let txDepth = 0;

/** Run a synchronous write inside an immediate transaction (nesting-safe). */
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn();

  const database = db();
  database.exec("BEGIN IMMEDIATE");
  txDepth += 1;
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  } finally {
    txDepth -= 1;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function event(actor: string | null, action: string, detail?: unknown) {
  db()
    .prepare("INSERT INTO events (at, actor, action, detail) VALUES (?, ?, ?, ?)")
    .run(nowIso(), actor, action, detail === undefined ? null : JSON.stringify(detail));
}

export function newId(): string {
  return crypto.randomUUID();
}
