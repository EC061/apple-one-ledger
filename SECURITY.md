# Security policy

## Reporting

Please do not open a public issue for a vulnerability. Use GitHub's private
**Report a vulnerability** button under the Security tab, or email the
maintainer listed on the repository profile.

Include: affected version/commit, reproduction steps, impact, and any suggested
fix. You will get an acknowledgement within a few days.

## Scope

This is a self-hosted app that handles family payment records and, optionally, SMTP
credentials. In scope:

- authentication bypass (passwords, admin registration code, sessions)
- authorization issues (reading or changing another member's invoices)
- SQL injection, path traversal, SSRF, upload handling (`/api/ocr`)
- secret leakage in logs, responses, or the repository

Out of scope: findings that require the attacker to already control the server,
the database volume, or the `.env` file.

## Secrets

`SESSION_SECRET`, `ADMIN_REG_CODE` and the SMTP password are environment-only
(or entered in Settings and stored in SQLite for SMTP). They are never committed.
If you rotate `SESSION_SECRET`, every session is invalidated and everyone signs
in again.

## Supported versions

The `main` branch and the latest published container image receive fixes.
