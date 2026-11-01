# Security policy

## Reporting

Please do not open a public issue for a vulnerability. Use GitHub's private
**Report a vulnerability** button under the Security tab, or email the
maintainer listed on the repository profile.

Include: affected version/commit, reproduction steps, impact, and any suggested
fix. You will get an acknowledgement within a few days.

## Scope

This is a self-hosted app that handles family payment records and, optionally,
SMTP/IMAP credentials. In scope:

- authentication bypass (member access codes, admin registration code, sessions)
- authorization issues (reading or changing another member's invoices)
- payment-matching abuse (`/api/payments/ingest`, `/api/storage/observations`)
- SQL injection, path traversal, SSRF, upload handling (`/api/ocr`)
- secret leakage in logs, responses, or the repository

Out of scope: findings that require the attacker to already control the server,
the database volume, or the `.env` file.

## Secrets

`SESSION_SECRET`, `ADMIN_REG_CODE`, `INGEST_TOKEN`, `STORAGE_TOKEN`,
`CRON_SECRET`, SMTP and IMAP passwords are environment-only. They are never
committed and never written to SQLite. If you rotate `SESSION_SECRET`, every
member access code is invalidated and must be reissued.

## Supported versions

The `main` branch and the latest published container image receive fixes.
