# Apple One Family Ledger — wiki

Self-hosted ledger for **one** family sharing two subscriptions:

- **Apple One Premier** — Apple Music, Apple TV+, Apple Arcade, Apple News+, Apple Fitness+, iCloud+ 2 TB
- **AppleCare One** — device coverage for the family

Six seats, quarterly / half-year / annual billing, USD or CNY, email reminders and a fair-share
storage view. No multi-tenant/family management.

## Start here

- [Architecture](Architecture) — how the pieces fit and where state lives
- [Configuration](Configuration) — every environment variable and admin setting
- [Deployment](Deployment) — compose, reverse proxy, backups, upgrades, GHCR
- [Billing and payments](Billing-and-Payments) — pricing rules, invoices, CNY, approval flow
- [Storage](Storage) — 2 TB split, manual readings, alerts
- [Email and reminders](Email-and-Reminders) — SMTP, templates, schedule
- [Security](Security) — auth model, rate limits, audit results
- [Development and CI](Development-and-CI) — scripts, React Doctor, CodeQL, native builds
- [Troubleshooting](Troubleshooting)

## Five-minute install

```bash
cp .env.example .env          # SESSION_SECRET (32+), ADMIN_REG_CODE (12+), APP_URL
docker compose pull
docker compose up -d
```

Then `http://127.0.0.1:18900/login` → admin code + email → **Invites** → send a token.

The compose file binds to loopback; terminate TLS with Caddy or nginx.
