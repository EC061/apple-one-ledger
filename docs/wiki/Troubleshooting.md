# Troubleshooting

## Compose refuses to start

`SESSION_SECRET`, `ADMIN_REG_CODE` and `APP_URL` use `${VAR:?…}`. An empty or missing value stops
`docker compose` before the container starts. Put real values in `.env`; `APP_URL` must be the
public `https://` URL.

## Admin sign-in says invalid

- Login is **email + password**, not the admin code.
- The admin code is only for `/signup` (first run) or password recovery with the same
  email; it must be at least **12 characters**.
- If you forgot the admin password, use `/signup` with `ADMIN_REG_CODE` and the admin
  email to set a new one.

## Member/invite sign-in fails

- `used` — invite already redeemed.
- `expired` — past the invite expiry.
- `weak` — password under 12 characters or too few character classes.
- `full` — six active seats; remove one first.
- `exists` — email already has an account; sign in instead.
- `removed` — the seat was disabled.

## No email arrives

1. Settings → Email shows whether SMTP is configured and the last messages.
2. Status `skipped` means SMTP is disabled/incomplete; `failed` shows the SMTP error.
3. Use **Test SMTP**.
4. Gmail/Outlook need an app password, not the account password.

## CNY amount looks wrong

The rate is locked when the invoice is issued. frankfurter.app publishes the ECB reference rate
once per business day (weekends reuse Friday). Use a manual rate under Settings if you need to
match the rate WeChat/Alipay actually charged. Invoice creation refuses to proceed if no rate is
available at all.

## `docker pull ghcr.io/...` returns 401

The GHCR package is private. Either make it public (GitHub → Packages → package → Package
settings → Change visibility) or `docker login ghcr.io` on the host with a `read:packages` token.

## OCR says 501

Tesseract is not installed in the image/runtime. The published image includes it; a custom build
must install `tesseract-ocr`, `tesseract-ocr-eng` and `tesseract-ocr-chi-sim`.

## Wiki clone fails with “Repository not found”

GitHub creates `<repo>.wiki.git` only after the first page exists. Open the Wiki tab, click
**Create the first page**, save, then run `scripts/publish-wiki.sh`.

## SQLite permission error

The entrypoint fixes `/data` ownership to uid 1001 at start. A bind mount created by another user
with odd ACLs can still block writes; `chown -R 1001:1001 ./data` on the host.

## Installed PWA asks for the code again

iOS keeps a separate cookie store for home-screen apps. Sign in once inside the installed app;
the session then persists normally.
