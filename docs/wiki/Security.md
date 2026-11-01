# Security

## Authentication

One page, `/login`, accepts three kinds of code:

1. **Admin** — `ADMIN_REG_CODE` (12+ chars) plus the admin email. The first successful use creates
   the admin account; later logins must use the same email.
2. **Member** — the 16-character access code issued at signup.
3. **Invite** — unused, unexpired invite token; creates the member with the entered name/email.

Codes are compared constant-time (admin) or via peppered SHA-256 (members). Sessions are random
256-bit tokens stored hashed, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS, 30 days by default.

## Hardening in place

- Per-IP **and** global login attempt limits; client IP comes from the proxy-appended
  `X-Forwarded-For`, never `X-Real-IP`.
- Admin failures are indistinguishable from a wrong code (no credential oracle).
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
`SESSION_SECRET` invalidates every member access code.

## Reporting

See [SECURITY.md](https://github.com/EC061/apple-one-ledger/blob/main/SECURITY.md). Do not open a
public issue for a vulnerability.
