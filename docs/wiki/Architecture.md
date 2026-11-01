# Architecture

## Stack

- **Next.js 16** App Router, React 19, TypeScript, standalone output.
- **SQLite** through Node's built-in `node:sqlite` (no native module), WAL mode,
  `synchronous=FULL`, single connection per process.
- Plain CSS (`src/app/globals.css`) with theme tokens on `html[data-theme]`.
- Docker image on GHCR; no external services.

## Layout

```
src/app
  page.tsx                 public landing (bilingual, dark)
  login                    unified admin/member/invite sign-in
  dashboard                member area, pay page
  admin/(protected)        overview, pool, members, invoices, invites, settings
  api/health               liveness + SQLite check
  api/ocr                  receipt screenshot OCR (tesseract)
  actions                  server actions (auth, member, admin)
src/lib
  db.ts                    schema, migrations, transactions
  auth.ts                  sessions, password hashing, admin/invite codes
  billing.ts               invoices, payments, coverage
  pricing.ts               plans, first-term/renewal prices, references
  fx.ts                    USD→CNY fetch + snapshot
  email.ts                 SMTP transport, templates, dedupe
  reminders.ts             daily jobs
  settings.ts              defaults + persistence
src/instrumentation.ts     in-process scheduler (6 h)
```

## Data model

| Table | Purpose |
| --- | --- |
| `users` | admin + members; scrypt password hash, status, paid-through |
| `sessions` | hashed session tokens, 30-day default lifetime |
| `invites` | one-time, expiring seat tokens |
| `invoices` | term, period, amount USD, CNY reference, status, reference |
| `payments` | member reports / admin confirmations, pending-confirmed-rejected |
| `settings` | JSON sections: plan, pricing, payments, smtp, fx, reminders, app |
| `fx_rates` | daily USD→CNY snapshots |
| `emails` | delivery log + dedupe keys |
| `events` | audit trail |

## Request flow

1. Server components read settings and data synchronously from SQLite.
2. Mutations are **server actions** with `requireUser()` / `requireAdmin()` guards.
3. Invoice changes run inside `BEGIN IMMEDIATE` and use status predicates, so concurrent
   submit/approve/void cannot overwrite each other.
4. The daily job runs inside the container every 6 hours (editable): overdue marking, FX,
   advance notices and late admin notices.

## Deliberate limits

- One family, six seats; no tenant isolation.
- No payment-provider API integration (personal WeChat/Alipay/Venmo/Zelle have none).
- SQLite is designed for one container with one volume; not multi-writer replicas.
