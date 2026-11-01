# Apple One Family Ledger

Self-hosted cost-sharing tracker for **one** Apple One Premier + AppleCare One family plan.
Six seats, invite-only access, quarterly / half-year / annual terms, USD or CNY payments,
email reminders, and an admin console with full payment history.

Next.js 15 (standalone) · SQLite in WAL mode · Docker · GHCR · MIT.

---

## What it does

| Area | Behaviour |
| --- | --- |
| Seats | 6 total (admin + 5). Invite link per seat, single use, expiring. |
| Access | Members sign in with a 16-character access code. Admins use `ADMIN_REG_CODE` from the environment. |
| Terms | Quarterly (3 mo), half-year (6 mo), annual (12 mo). |
| Pricing | First term **$45 / $90 / $180** flat. Renewals **$51 / $96 / $180**. Shown before the first payment. |
| Cost basis | $89.94/month for the plan ÷ 6 = **$14.99** per seat/month. |
| Payments | WeChat Pay, Alipay, Venmo, Zelle. Member reports the payment, admin confirms — or automatic matching confirms it. |
| CNY | Each invoice locks the USD→CNY rate on its issue date. |
| Reminders | Email before due, while overdue, and before removal. Optional daily admin digest. |
| Storage | Per-member GB against the shared 2 TB pool; fair-share alerts to member + admin, with staleness handling. |
| Admin | Who paid, when, how; outstanding and overdue totals; seat and storage usage; email log; settings. |

There is deliberately **one family**. Multi-tenant management is out of scope.

---

## Pricing rules in code

`src/lib/settings.ts` holds the defaults, editable in **Admin → Settings**:

```
monthlyTotalUsd : 89.94      // whole plan
seats           : 6          // admin included
firstTerm       : { quarterly: 45, semiannual: 90, annual: 180 }
renewal         : { quarterly: 51, semiannual: 96, annual: 180 }
```

A member's invoice uses `firstTerm` for term 1 and `renewal` for every later term.
The UI states this on the landing page, the join page, the plan picker, and every invoice.
Changing the numbers in Settings changes future invoices only; existing invoices keep their amount.

---

## Quick start (Docker Compose)

```bash
git clone https://github.com/<you>/applecare-one-tracker.git
cd applecare-one-tracker

cp .env.example .env
# edit .env — at minimum SESSION_SECRET (32+ chars) and ADMIN_REG_CODE
#   openssl rand -base64 48
# optional but recommended: INGEST_TOKEN, STORAGE_TOKEN, CRON_SECRET

docker compose up -d --build
```

Open `http://localhost:3000/admin/login`, enter your email and the `ADMIN_REG_CODE`,
then create invites under **Invites**.

### Using the published image

Every push to `main` and every `v*.*.*` tag builds `linux/amd64` + `linux/arm64` images:

```yaml
services:
  app:
    image: ghcr.io/<your-github-user>/applecare-one-tracker:latest
    # ...
```

```bash
docker pull ghcr.io/<your-github-user>/applecare-one-tracker:latest
```

The workflow is `.github/workflows/docker-publish.yml` and uses the built-in `GITHUB_TOKEN`
(`packages: write`). No extra secrets needed. Make the package public in GitHub package
settings if you want anonymous pulls.

---

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | Peppers access-code hashes and session tokens. Changing it invalidates all member codes. |
| `ADMIN_REG_CODE` | yes | Password for `/admin/login`. Never written to the database. |
| `INGEST_TOKEN` | recommended | Bearer token for `/api/payments/ingest` (can mark invoices paid). |
| `STORAGE_TOKEN` | recommended | Separate bearer token for `/api/storage/update`. Falls back to `INGEST_TOKEN` if unset. |
| `CRON_SECRET` | recommended | Bearer token for `/api/cron/daily`. |
| `APP_URL` | optional | Canonical public URL (e.g. `https://plan.example.com`). Without it, links follow `X-Forwarded-Proto` / `X-Forwarded-Host`. |
| `APP_TIMEZONE` | optional | IANA zone for "today", due dates, digests. Default `UTC`. |
| `DATA_DIR` / `DATABASE_PATH` | optional | Defaults `/data` and `/data/applecare.db` in Docker. |
| `INTERNAL_SCHEDULER` | optional | `true` runs the daily job in-process every 6 h. |
| `COOKIE_SECURE` | optional | `true`/`false` override; otherwise auto-detected. |
| `TRUST_PROXY_HOPS` | optional | How many proxies to trust in `X-Forwarded-For` (default 1). Set 0 to ignore it. |
| `FX_FALLBACK_RATE` | optional | Last-resort USD→CNY rate (default 7.2). |

---

## Reverse proxy and HTTPS

Invite links are built from the request at render time:

1. `APP_URL` if set;
2. otherwise `X-Forwarded-Proto` + `X-Forwarded-Host`;
3. otherwise the `Host` header.

That means a link copied from the admin page always points at the HTTPS address the admin is
actually using — no hard-coded hostname. Set `APP_URL` if you want a single canonical domain
behind multiple proxies.

Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` when the request is HTTPS.

<details>
<summary>Caddy example</summary>

```caddyfile
plan.example.com {
    reverse_proxy 127.0.0.1:3000
}
```
</details>

<details>
<summary>nginx example</summary>

```nginx
server {
  listen 443 ssl;
  server_name plan.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```
</details>

---

## Payments

### The flow

1. Member picks a term → invoice with a unique reference like `A1-7F3K2QW`.
2. Member pays by WeChat / Alipay / Venmo / Zelle, **putting the reference in the note**.
3. Member clicks “I have sent this payment” → invoice becomes `submitted`.
4. Admin confirms → invoice `paid`, coverage extends, receipt email sent.
   Or automatic matching does step 4 for you.

USD and CNY amounts are both on the invoice. CNY uses the rate locked at issue time, so the
member is never surprised by a moving exchange rate.

### Automatic checking — what is actually possible

There is **no public API** to read incoming payments from personal WeChat Pay, Alipay, Venmo,
or Zelle accounts, and these services do not offer merchant webhooks for personal transfers.
So “automatic” here means **matching**, not polling those providers:

```
provider/bank notification ──► email forward / Zapier / bank webhook
        │
        ▼
POST /api/payments/ingest   (Bearer INGEST_TOKEN)
        │  { reference, amount, currency, method, txRef }
        ▼
match invoice by reference ──► amount within tolerance? ──► paid automatically
                                       │ no
                                       ▼
                              queued for admin review
```

Two supported paths:

1. **Ingest webhook** (reliable). Point any automation at the endpoint below. Amounts within
   `toleranceUsd` (default $0.50) settle the invoice; anything else becomes a pending payment
   for the admin to approve or reject. Transactions are unique by `txRef`, so retries are safe.
2. **IMAP polling** (best-effort, off by default). Enable in Settings → Automation and give the
   mailbox that receives payment notifications. Unread mail is scanned for an `A1-XXXXXXXX`
   reference and a `$`/`¥` amount; matching mail is marked read. Provider email formats change,
   so treat this as a convenience, not a contract.

```bash
curl -X POST https://plan.example.com/api/payments/ingest \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "A1-7F3K2QW",
    "amount": 45.00,
    "currency": "USD",
    "method": "venmo",
    "txRef": "4281920384"
  }'
```

Responses: `200 { status: paid | review | duplicate }`, `404` unknown reference,
`401` bad token, `422` amount/reference problem.

---

## Storage tracking (2 TB ÷ 6)

Each seat has a **fair share** of the pool: `totalGb / shareCount` (2000 ÷ 6 ≈ 333 GB).
The member dashboard, admin overview and member table show usage and a progress bar. When usage
is above the share, the member gets an email and the admin gets a summary — at most one member
email per ISO week and one admin summary per day. Readings older than `maxAgeDays` (default 45)
are shown as stale and never trigger email.

> This is a fair-share guideline, not a hard cap. Apple does not partition the pool; one member
> using 500 GB simply leaves less for everyone else and blocks nobody.

`shareCount` is separate from billing seats: if the admin is only collecting money and is not in
the Apple family, set it to 5 so the other members keep their real share.

**Can it be fully automatic?** Not from Apple. Family iCloud+ usage is visible to the organizer
in Settings → Family → Subscriptions → iCloud+ (and on iCloud.com), but there is no public API,
no plist/backup field, and no Shortcuts action for it. Scraping iCloud requires the organizer's
password plus 2FA and conflicts with Apple's terms. The realistic automation is: **read the
screen once, submit the numbers once.**

Two endpoints do that, both Bearer `STORAGE_TOKEN`:

### Batch observation (recommended)

```bash
curl -X POST https://plan.example.com/api/storage/observations \
  -H "Authorization: Bearer $STORAGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "observationId": "6f0c2a3e-7d1b-4c55-9a51-2d6a1b0c9e77",
    "observedAt": "2026-11-01T14:00:00Z",
    "source": "ios-shortcut-confirmed",
    "readings": [
      { "email": "sam@example.com", "usedGb": 342.5 },
      { "email": "alex@example.com", "usedGb": 188.0 }
    ]
  }'
```

- `observationId` is the idempotency key: replaying the same payload returns `200` with
  `"duplicate": true`; reusing the id with different numbers returns `409`.
- One request stores every member at the same `observedAt`, so a batch cannot half-apply.
- Unknown members and out-of-range values are reported in `skipped` and do not block the rest.
- Every accepted value is also written to `storage_readings` (who, when, source) for auditing.

### Single value

```bash
curl -X POST https://plan.example.com/api/storage/update \
  -H "Authorization: Bearer $STORAGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "email": "sam@example.com", "usedGb": 342.5 }'
```

Want to test the undocumented `setup/web/family/getFamilyDetails` and
`setup/ws/1/storageUsageInfo` endpoints yourself? `contrib/icloud-probe` prints exactly what
they return for your account. Source reading says: family identities + the organizer's
aggregate usage, no per-member GB — the probe confirms or disproves it empirically. It is
unsupported, keeps credentials local, and is not part of the image.

The endpoint rejects values above the whole pool (a common bytes-vs-GB typo) and returns the
quota and percentage.

### iOS Shortcut (4–8 h build, low risk)

1. Open **Settings → Family → Subscriptions → iCloud+** (or **Settings → [name] → iCloud →
   Storage → Family Usage** where shown) and take a screenshot showing all members.
2. Shortcut: **Extract Text from Image →** (optional) **Ask for Input** to correct the numbers
   **→ Get Contents of URL**, method `POST`, JSON body matching the contract above, header
   `Authorization: Bearer …`.
3. Add it to the Share Sheet so the screenshot is the input, and have the Shortcut ask you to
   confirm before submitting.

Apple does not partition the pool, so this is a **fair-share guideline**: one member over quota
does not block anyone, it just leaves less for the rest.

## Email

Configure SMTP in **Admin → Settings → Email** (host, port, implicit TLS, user, password, from)
and use **Test SMTP**. Message types:

- invite link, access code
- payment reminder (N days before due), overdue reminder, removal warning
- payment receipt
- daily admin digest (open payments, outstanding, seats)
- storage over-quota alert (member + admin)

Every message is logged to the `emails` table and shown in Settings, including failures. If SMTP
is not configured, messages are recorded as `skipped` — nothing is silently lost.

---

## Scheduler

Reminders, overdue marking, FX refresh, storage checks and the digest are idempotent across
runs and deduplicated per day/week. Trigger them with either:

- **Admin → Overview → Run daily jobs**, or
- external cron:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://plan.example.com/api/cron/daily
```

```
0 9 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://plan.example.com/api/cron/daily
```

- or set `INTERNAL_SCHEDULER=true` to run inside the container every 6 hours.

---

## Data, backups, upgrades

Everything lives in one SQLite file with WAL enabled
(`/data/applecare.db`, `-wal`, `-shm`).

```bash
# consistent hot backup (safe while running)
docker compose exec app node -e "
  const {DatabaseSync}=require('node:sqlite');
  new DatabaseSync('/data/applecare.db').exec(\"VACUUM INTO '/data/backup-'+Date.now()+'.db'\")"
```

Copy `/data` (or the backup file) off the host. To upgrade:

```bash
docker compose pull && docker compose up -d
```

Schema changes are additive and applied automatically at boot (`ensureColumn`). Back up first
anyway.

---

## Security notes

- Admin login: `ADMIN_REG_CODE` compared in constant time; the account is created on first use
  with the email you enter.
- Member login: 16-character random codes, stored as peppered SHA-256; sessions are random
  256-bit tokens stored hashed, 30-day expiry.
- Login and invite endpoints are rate-limited in-process (single container).
- Server Actions validate and re-check the session; ingest/cron endpoints require bearer tokens
  with constant-time comparison.
- All pages are `noindex`; `robots.txt` disallows everything.
- SQLite runs as the unprivileged `nextjs` user; only `/data` is writable.
- Rate limiting is per-process. If you scale to multiple replicas, move it to a shared store —
  and note that SQLite on a shared volume is not designed for multi-writer replicas.

---

## Development

```bash
npm install
cp .env.example .env        # set SESSION_SECRET + ADMIN_REG_CODE
npm run dev                 # http://localhost:3000
npm run typecheck
npm run build && npm start
```

Requires Node ≥ 22.13 (uses the built-in `node:sqlite`, so there is no native build step).

### Layout

```
src/app                  pages + route handlers (App Router)
  admin/(protected)      admin console behind requireAdmin()
  dashboard              member area
  api/{health,payments,cron,storage}
  actions                server actions (auth, member, admin)
src/lib                  db, auth, billing, pricing, fx, email, reminders,
                         reconcile, storage, settings
src/components           UI primitives + client form widgets
src/instrumentation.ts   optional in-process scheduler
```

---

## License

MIT. Not affiliated with Apple. “Apple One”, “AppleCare” and “iCloud+” are trademarks of
Apple Inc., used descriptively.
