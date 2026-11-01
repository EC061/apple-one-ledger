# Apple One Family Ledger

Invite-only cost-sharing ledger for **one** family sharing **Apple One Premier + AppleCare One**.
Six seats, quarterly/half-year/annual terms, USD or CNY, email reminders and a storage fair-share view.

## What it does

- **Seats**: 6 total, invite-token signup, email + password login, admin can disable/restore a seat.
- **Terms**: quarterly / half-year / annual; first term $45 / $90 / $180, renewals $51 / $96 / $180.
- **Cost basis**: $89.94 per month ÷ 6 = **$14.99 per seat**.
- **Payments**: WeChat Pay, Alipay, Venmo, Zelle; member reports, admin approves; CNY locks the daily USD→CNY rate.
- **Notifications**: one 7-day advance notice (member + admin) and one 1-day-late admin notice per invoice; receipts.
- **Storage**: 2 TB iCloud+ split ≈333 GB per seat, with over-quota emails.
- **Public page**: bilingual English/中文, dark by default, live pricing and services.
- **Stack**: Next.js 16, SQLite (WAL), Docker, PWA, GHCR multi-arch image.

## Quick start

```bash
cp .env.example .env
# SESSION_SECRET=$(openssl rand -base64 48)
# ADMIN_REG_CODE: 12+ characters
# APP_URL=https://plan.example.com

docker compose pull
docker compose up -d
```

Open `http://127.0.0.1:18900/signup` and use `ADMIN_REG_CODE` with your name, email and a 12+
character password. Sign in afterwards at `/login` with that email and password. Then create
invites under **Invites**. The compose file binds to loopback on purpose — put Caddy/nginx in
front for HTTPS.

Local build: `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`

## Documentation

- **Wiki**: https://github.com/EC061/apple-one-ledger/wiki
- Wiki source lives in [`docs/wiki`](docs/wiki/Home.md); publish with `scripts/publish-wiki.sh`
  (GitHub creates the wiki repository after the first page is created in the UI).
- [Security policy](SECURITY.md) · [MIT license](LICENSE)
