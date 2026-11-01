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

docker compose pull
docker compose up -d
```

The compose file pulls `ghcr.io/ec061/apple-one-ledger:latest` and keeps SQLite in
`./data`. It binds to **127.0.0.1:18900** on purpose: put Caddy/nginx in front for HTTPS
instead of exposing the app directly. `APP_URL` is required so emailed links cannot be
poisoned by a forged Host header. To build the image yourself instead:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Open `http://localhost:18900/login` and enter `ADMIN_REG_CODE` with your admin email. The same
page handles member sign-in, invite redemption and admin sign-in — the code decides. Then create
invites under **Invites**.

### Published image

Every push to `main` and every `v*.*.*` tag builds `linux/amd64` + `linux/arm64` images:

```bash
docker pull ghcr.io/ec061/apple-one-ledger:latest
```

Set `TAG` in `.env` to pin a version (`TAG=v1.2.3`) or a digest. The workflow writes a
registry build cache to `ghcr.io/ec061/apple-one-ledger:buildcache`, so rebuilds only redo the
layers that changed.

The workflow is `.github/workflows/docker-publish.yml` and uses the built-in `GITHUB_TOKEN`
(`packages: write`). No extra secrets needed. Make the package public in GitHub package
settings if you want anonymous pulls.

---

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | Peppers access-code hashes. 32+ chars; changing it invalidates all member codes. |
| `ADMIN_REG_CODE` | yes | Admin code for `/login` (12+ characters). Never written to the database. |
| `APP_URL` | yes | Canonical public URL (e.g. `https://plan.example.com`). Required so emailed links cannot be poisoned by a forged Host header. |
| `DATA_DIR` / `DATABASE_PATH` | compose sets them | `/data` and `/data/applecare.db`. |
| `PORT` | compose sets it | Internal listen port `3000`; compose publishes `18900`. |
| `NODE_ENV` | compose sets it | `production`. |

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

### Why there is no automatic bank hook

WeChat Pay, Alipay, Venmo and Zelle do not offer a webhook or API for **personal** transfers.
The only ways to automate confirmation would be parsing provider emails (fragile, breaks with
every template change, needs mailbox credentials) or scraping a personal banking session
(against the terms, breaks under 2FA). For a six-person plan that is more moving parts than it
saves.

So the flow is deliberately manual and takes one tap:

1. The member pays with the reference in the note.
2. They tap **I have sent this payment** (amount, method, transaction id).
3. The admin sees it under **Invoices → Payments to review** and approves or rejects it.

The pending report carries the claimed amount, so a short payment is visible before approval.
If you ever do want automation, an external service can still POST to nothing today — there is
no ingest endpoint in this build.

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

Usage is entered in **Admin → Members** with the `Save GB` button on each member row. That is
the whole workflow: open the Family Sharing storage screen once a month, type six numbers, done.
The member dashboard, admin overview and member table update immediately, and over-quota emails
go to the member and to you.

There is no storage API and no Shortcut to maintain in this build. `contrib/icloud-probe` remains
as a read-only experiment if you want to see what the private endpoints return — it does not post
anything into the app.

## Public page, language and theme

The landing page is the public rules page: pricing, cost arithmetic, every service in the plan,
the iCloud+ split, payment methods, email notifications and the seat policy. It reads live
settings, so changing pricing, seats, grace days or the service list in **Admin → Settings**
updates it immediately.

- **Bilingual** English / Simplified Chinese. Default comes from the browser's
  `Accept-Language`; a header switch stores `a1_lang` and reloads.
- **Dark by default**, with a light switch in the header (`a1_theme` cookie). Tokens live on
  `html[data-theme]`, so the whole app follows the same choice.
- **Services** are editable as a one-per-line list under Settings → Plan & pricing, and the
  iCloud+ tile computes the per-seat share from the storage pool.

## Install on iPhone (PWA)

The app ships a web manifest, maskable icons and a conservative service worker (it caches only
`/_next/static/*` and icons — never HTML, API responses or payment data).

1. Open the site in **Safari** on the iPhone.
2. Tap **Share → Add to Home Screen**.
3. It installs as **A1 Ledger**, opens full-screen without browser chrome, and keeps the 30-day
   session cookie.

A dismissible hint appears on the dashboard for iOS Safari users who have not installed it yet.
`apple-mobile-web-app-*` metadata and the 180 px touch icon are set server-side, so the home
screen icon and title are correct without any extra configuration.

## Payment screenshot assist (OCR)

On the payment page the member can either:

- **upload a WeChat / Alipay / Venmo / Zelle receipt screenshot** — the server runs `tesseract`
  (installed in the image), extracts the amount and transaction number, and shows them for
  confirmation before filling the form; or
- **paste the text** using iOS Live Text (long-press the screenshot → Copy Text) — parsed with the
  same logic, entirely in the browser.

The image is written to a temporary file, read once, and deleted. It is never stored, attached to
a payment, or sent anywhere else. The member always confirms the values before submitting, and
manual entry works unchanged.

Local development needs tesseract:

```bash
sudo apt install tesseract-ocr tesseract-ocr-eng   # Debian/Ubuntu
brew install tesseract                             # macOS
```

Without it, `/api/ocr` returns `501` with a clear message and the manual form still works.

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

The daily job runs **inside the container** every 6 hours: it marks overdue invoices, refreshes
the USD→CNY rate, sends reminders, the admin digest and storage alerts. Work is deduplicated, so
running more often than daily is harmless and no external cron is needed.

You can also trigger it by hand from **Admin → Overview → Run daily jobs**.

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

- Admin sign-in: `ADMIN_REG_CODE` compared in constant time on the shared `/login` page; the account is created on first use
  with the email you enter.
- Member login: 16-character random codes, stored as peppered SHA-256; sessions are random
  256-bit tokens stored hashed, 30-day expiry.
- Login and invite endpoints are rate-limited in-process (single container).
- Server Actions validate and re-check the session.
- All pages are `noindex`; `robots.txt` disallows everything.
- SQLite runs as the unprivileged `nextjs` user; only `/data` is writable.
- Rate limiting is per-process. If you scale to multiple replicas, move it to a shared store —
  and note that SQLite on a shared volume is not designed for multi-writer replicas.

---

## Development

```bash
npm install
npm run doctor        # React Doctor: 100/100, runs on every commit via .git/hooks
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
  api/{health,ocr}
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
