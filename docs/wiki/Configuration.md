# Configuration

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `SESSION_SECRET` | yes | 32+ chars. Peppers session token hashes; changing it signs everyone out. `openssl rand -base64 48`. |
| `ADMIN_REG_CODE` | yes | 12+ chars. Registration/recovery code for the admin account; not a login password. |
| `APP_URL` | yes | Canonical HTTPS URL. Used for emailed links; required so a forged Host header cannot poison them. |
| `DATA_DIR` | compose sets | `/data`. |
| `DATABASE_PATH` | compose sets | `/data/applecare.db`. |
| `PORT` | compose sets | Internal `3000`; host publishes `127.0.0.1:18900`. |
| `NODE_ENV` | compose sets | `production`. |

Everything else is stored in SQLite and editable at **Admin → Settings**:

- **Plan & pricing** — plan name, timezone (default `America/New_York`), seats, grace days,
  payment due window, monthly cost, first-term and renewal prices, service list.
- **Payment details** — WeChat / Alipay IDs, QR upload (camera/photo, stored in `/data/uploads`) or URL, Venmo handle, Zelle email, instructions.
- **SMTP** — host, port, TLS, user, password, from; test send.
- **Exchange rate** — automatic (frankfurter/ECB) or manual; refresh now.
- **Reminders** — the single advance notice (7 days) and the single late admin notice (1 day).
- **Storage** — pool size, sharing count, warn threshold, stale age, member/admin alerts.
- **Application** — session lifetime, scheduler interval, payment tolerance.

## First run

1. Set `.env` (see above) and `docker compose up -d`.
2. Open `/signup`: `ADMIN_REG_CODE`, name, email and a strong password → admin account is created
   and you land in `/admin`. Sign in later at `/login` with email + password.
3. Create an invite under **Invites**; the member opens the link, lands on `/signup`, and sets
   their own name, email and password.
4. Set payment handles and SMTP in Settings before sending invoices.

## Notes

- Passwords are hashed with scrypt. A member who forgets it gets a new one from
  **Members → Set password** (that also signs them out everywhere). The admin can recover their
  own account by using `ADMIN_REG_CODE` with the same email on `/signup`.
- Removing a seat revokes sessions, voids open invoices and frees the seat; history stays.
- **Preview dashboard** in Members (or Pool → Preview) opens a read-only copy of that member's
  dashboard, including coverage, invoices, term prices and storage.
- The installed PWA starts at **`/quick`**: a mobile control panel with per-member mark-paid,
  proof upload and WeChat/Alipay QR upload. Members are redirected to their dashboard.
- Timezone affects "today", due dates and reminder windows.
