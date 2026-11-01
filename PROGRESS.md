# Build progress

## Core
- [x] Next.js 15 + TypeScript + standalone output
- [x] SQLite via `node:sqlite`, WAL + `synchronous=FULL`, nested-safe transactions, additive migrations
- [x] Schema: users, sessions, invites, invoices, payments, settings, fx_rates, emails, events, storage_readings, storage_observations
- [x] Pricing: first term 45 / 90 / 180; renewals 51 / 96 / 180; 89.94 ÷ 6 = 14.99, all editable
- [x] Invoice lifecycle with status-predicate updates and partial-payment control
- [x] FX service: daily USD→CNY, manual override, per-invoice rate snapshot; refuses fabricated fallback rates

## Access
- [x] Invite links derived from `APP_URL` / `X-Forwarded-*` (reverse-proxy HTTPS aware)
- [x] Single-use expiring invites, seat cap, plan-timezone expiry
- [x] 16-char access codes (peppered hash), server-rendered one-time reveal, hashed sessions
- [x] Admin login with `ADMIN_REG_CODE`; first-login claim; secret strength enforced in production
- [x] Rate limiting, constant-time comparisons, sign-out-everywhere

## Payments & mail
- [x] WeChat / Alipay / Venmo / Zelle details + QR; only configured methods offered
- [x] USD + CNY, locked rate, 8-char reference codes
- [x] Duplicate-safe ingest, tolerance, review queue, partial-payment guard
- [x] `confirmExistingPayment` avoids double-recording an approved transfer
- [x] SMTP config + test, all message types, per-day/per-week dedupe on success only
- [x] Daily jobs: overdue (awaiting only, not submitted), FX, reminders, digest, storage
- [x] External cron + optional in-process scheduler (global lock)

## Storage
- [x] Fair share = total ÷ shareCount (independent of billing seats)
- [x] Batch observation API with `observationId` idempotency + 409 conflicts
- [x] Single-value API retained; per-reading audit trail
- [x] Staleness suppression, never-report ≠ zero, over-quota alerts to member + admin
- [x] iOS Shortcut / OCR workflow documented

## UI
- [x] Landing with first-term vs renewal disclosure
- [x] Join / login / admin login
- [x] Dashboard: coverage, balance, term, storage, plan picker, payment, history
- [x] Payment page: both amounts, reference, next-renewal price, method details
- [x] Admin: overview, members, invoices, invites, settings, email log
- [x] Responsive CSS, focus rings, alert roles, no-JS baseline

## Deploy
- [x] Dockerfile: multi-stage, drop-privileges entrypoint (fixes bind-mount ownership), healthcheck
- [x] docker-compose with persistent volume, `init: true`
- [x] `.env.example`
- [x] CI: typecheck + build; GHCR publish gated on CI, multi-arch, SBOM/provenance
- [x] README, MIT license, robots.txt

## Verified
- [x] `tsc --noEmit` clean, `next build` clean
- [x] E2E: admin claim → invite → join → server-rendered code → invoice $45/¥299.38 → auto-pay → coverage → storage batch (idempotent, 409, 400)
- [x] Docker image builds and runs as non-root against a root-owned bind mount
- [x] Backend review by gpt-6.1-sol (T3 Code) — blocking findings fixed
- [x] Frontend review by claude-opus-5-5 (T3 Code) — blocking findings fixed
- [x] iCloud private-endpoint probe added under contrib/ (unsupported)
- [x] PWA: manifest, maskable icons, iOS meta, static-only service worker, install hint
- [x] Payment screenshot OCR + iOS Live Text paste assist with manual confirmation
- [x] React Doctor installed (dev dep, `npm run doctor`, CI workflow, pre-commit hook) — score 100/100

## Known limits (by design)
- Apple has no public family-storage API; usage is reported (manual or Shortcut/OCR).
- WeChat/Alipay/Venmo/Zelle have no personal-account payment API; matching happens through the ingest endpoint or admin confirmation.
- Rate limiting is in-process, so one container (as shipped) is assumed.
