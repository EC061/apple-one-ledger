# Security

## Authentication

Accounts sign in with **email + password** on `/login`. Passwords are hashed with scrypt and a
per-password salt; sessions are random 256-bit tokens stored hashed, `HttpOnly`, `SameSite=Lax`,
`Secure` on HTTPS, 30 days by default.

Two codes exist for **account creation**, never for login:

- `ADMIN_REG_CODE` (12+ chars) — creates the admin account on first use, or resets its password
  when used with the same email.
- **Invite token** — single-use, expiring; the member sets their own name, email and password.

There is no access-code login. A forgotten member password is reset by an admin under
**Members → Set password**; a forgotten admin password uses the admin code on the signup form.

## Hardening in place

- Per-IP **and** global login attempt limits; client IP comes from the proxy-appended
  `X-Forwarded-For`, never `X-Real-IP`.
- Login failures are generic; the admin registration code is compared constant-time and is not a login credential.
- Invite validity, expiry, seat count and email uniqueness are re-checked inside
  `BEGIN IMMEDIATE`; invite consumption requires `used_at IS NULL AND revoked_at IS NULL`.
- Invoice updates use status predicates; approving a payment cannot double-record it.
- OCR: authentication required, rate-limited, 4 MB body cap with required `Content-Length`,
  2 concurrent scans, temp file deleted, no OCR text returned.
- Emails escape member-supplied names/emails and strip CR/LF from subjects.
- Compose binds loopback, requires `APP_URL`, and runs as uid 1001 with `no-new-privileges`.
- SQLite: WAL + `synchronous=FULL`, foreign keys, busy timeout.

## CI

- Typecheck + production build, `npm audit --omit=dev --audit-level=high`, CodeQL
  (`security-and-quality`), React Doctor (blocking at warning, 100/100).
- React Doctor action floats on `@v2`; all other actions are pinned to major versions and updated
  by Dependabot.
- Branch protection on `main`: PR only, linear history, required checks, admins enforced, no
  reviewer requirement.

## Secrets

`SESSION_SECRET`, `ADMIN_REG_CODE`, SMTP credentials live only in the environment. Changing
`SESSION_SECRET` invalidates every session (everyone signs in again).

## Reporting

See [SECURITY.md](https://github.com/EC061/apple-one-ledger/blob/main/SECURITY.md). Do not open a
public issue for a vulnerability.
