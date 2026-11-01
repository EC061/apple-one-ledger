# Build progress

## Core
- [x] Next.js 15 + TypeScript + standalone output
- [x] SQLite via `node:sqlite`, WAL + busy timeout, additive migrations
- [x] Schema: users, sessions, invites, invoices, payments, settings, fx_rates, emails, events
- [x] Settings model (plan, pricing, payments, SMTP, FX, reminders, automation, IMAP, storage)
- [x] Pricing rules: first term 45 / 90 / 180; renewals 51 / 96 / 180; 89.94 ÷ 6 = 14.99
- [x] Invoice lifecycle: create → submit → verify/void, term index, paid-through recompute
- [x] Payment records (manual, ingest, IMAP, admin) with unique transaction refs
- [x] FX service: daily USD→CNY (frankfurter → open.er-api fallback), manual override, rate snapshot per invoice

## Access
- [x] Invite links derived from the reverse proxy HTTPS headers / `APP_URL`
- [x] Single-use, expiring invites; seat cap enforced
- [x] 16-char access codes (hashed), one-time flash display, session tokens (hashed)
- [x] Admin login with `ADMIN_REG_CODE`; first-login account claim
- [x] Rate limiting, constant-time comparisons, sign-out-everywhere

## Payments & mail
- [x] WeChat / Alipay / Venmo / Zelle details + QR on the payment page
- [x] USD + CNY with locked rate, reference codes
- [x] Auto-matching ingest endpoint (`/api/payments/ingest`), tolerance, duplicates, review queue
- [x] Optional IMAP poller
- [x] SMTP config + test, invite/access-code/reminder/overdue/removal/receipt/digest emails
- [x] Daily jobs: overdue marking, FX refresh, reminders, digest, storage alerts
- [x] External cron endpoint + optional in-process scheduler

## Storage
- [x] Per-member GB against the 2 TB pool (÷ seats)
- [x] Member dashboard meter + admin overview + member table
- [x] Over-quota email to member (weekly) and admin summary (daily)
- [x] Ingest endpoint `/api/storage/update` for automation
- [x] Honest documentation: Apple has no public family-storage API

## UI
- [x] Landing with pricing disclosure and renewal warning
- [x] Join / login / admin login
- [x] Member dashboard, plan picker, payment page, history, profile
- [x] Admin overview, members, invoices, invites, settings, email log
- [x] Responsive CSS design system, no client-side framework beyond React

## Deploy
- [x] Dockerfile (multi-stage, non-root, healthcheck, /data volume)
- [x] docker-compose with persistent volume
- [x] `.env.example`
- [x] GitHub Actions: typecheck + build
- [x] GitHub Actions: multi-arch GHCR publish with SBOM/provenance
- [x] README, LICENSE (MIT), robots.txt

## Verified
- [x] `tsc --noEmit` clean
- [x] `next build` clean
- [x] End-to-end smoke test: admin claim → invite → join → invoice ($45, ¥299.38) → ingest auto-pay → coverage → storage alert
- [x] API auth: 401 on bad token, duplicate detection, cron auth
- [ ] Docker image build
- [ ] Backend design review (requested model unavailable — see final report)
- [ ] Frontend design review (requested model unavailable — see final report)
