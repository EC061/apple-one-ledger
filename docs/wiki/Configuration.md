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
- **Payment details** — WeChat / Alipay IDs and QR URLs, Venmo handle, Zelle email, instructions.
- **SMTP** — host, port, TLS, user, password, from; test send.
- **Exchange rate** — automatic (frankfurter/ECB) or manual; refresh now.
- **Reminders** — 7 days before due, overdue cadence, removal cadence, renewal notice window,
  admin digest.
- **Storage** — pool size, sharing count, warn threshold, stale age, member/admin alerts.
- **Application** — session lifetime, scheduler interval, payment tolerance.

## First run

1. Set `.env` (see above) and `docker compose up -d`.
2. Open `/login` → **Create an account**: `ADMIN_REG_CODE`, name, email and a strong password →
   admin account is created and you land in `/admin`. Sign in later with email + password.
3. Create an invite under **Invites**; the member opens the link and sets their own name, email
   and password.
4. Set payment handles and SMTP in Settings before sending invoices.

## Notes

- Passwords are hashed with scrypt. A member who forgets it gets a new one from
  **Members → Set password** (that also signs them out everywhere). The admin can recover their
  own account by using `ADMIN_REG_CODE` with the same email in **Create an account**.
- Removing a seat revokes sessions, voids open invoices and frees the seat; history stays.
- Timezone affects "today", due dates, reminders and digests.
