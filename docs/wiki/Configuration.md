# Configuration

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32+ chars. Peppers access-code hashes; changing it invalidates all member codes. `openssl rand -base64 48`. |
| `ADMIN_REG_CODE` | yes | 12+ chars. Admin sign-in code, never stored in SQLite. |
| `APP_URL` | yes | Canonical HTTPS URL. Used for emailed links; required so a forged Host header cannot poison them. |
| `DATA_DIR` | compose sets | `/data`. |
| `DATABASE_PATH` | compose sets | `/data/applecare.db`. |
| `PORT` | compose sets | Internal `3000`; host publishes `127.0.0.1:18900`. |
| `NODE_ENV` | compose sets | `production`. |

Everything else is stored in SQLite and editable at **Admin → Settings**:

- **Plan & pricing** — plan name, timezone (default `America/New_York`), seats, grace days,
  payment due window, monthly cost, first-term and renewal prices, service list.
- **Payment details** — WeChat / Alipay IDs and QR URLs, Venmo handle, Zelle email, instructions.
- **SMTP** — host, port, TLS, user, password, from; test send.
- **Exchange rate** — automatic (frankfurter/ECB) or manual; refresh now.
- **Reminders** — 7 days before due, overdue cadence, removal cadence, renewal notice window,
  admin digest.
- **Storage** — pool size, sharing count, warn threshold, stale age, member/admin alerts.
- **Application** — session lifetime, scheduler interval, payment tolerance.

## First run

1. Set `.env` (see above) and `docker compose up -d`.
2. Open `/login`, enter `ADMIN_REG_CODE` + admin email → admin account is created and you land
   in `/admin`.
3. Create an invite under **Invites**; the member opens the link, enters the code plus name and
   email, and gets an access code immediately (also emailed if SMTP is configured).
4. Set payment handles and SMTP in Settings before sending invoices.

## Notes

- Member access codes are shown once on creation. If lost, **Members → Reset access code**
  issues a new one and signs that member out everywhere.
- Removing a seat revokes sessions, voids open invoices and frees the seat; history stays.
- Timezone affects "today", due dates, reminders and digests.
