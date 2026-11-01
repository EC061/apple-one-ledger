# Troubleshooting

## Compose refuses to start

`SESSION_SECRET`, `ADMIN_REG_CODE` and `APP_URL` use `${VAR:?…}`. An empty or missing value stops
`docker compose` before the container starts. Put real values in `.env`; `APP_URL` must be the
public `https://` URL.

## Admin sign-in says invalid

- `ADMIN_REG_CODE` must be at least **12 characters**; shorter values disable admin auth.
- The email must match the admin account created on first use. A different email returns the
  generic failure on purpose.
- If no admin exists, the first valid code + email creates it.

## Member/invite sign-in fails

- `used` — invite already redeemed.
- `expired` — past the invite expiry.
- `full` — six active seats; remove one first.
- `exists` — email already has an account; use its access code.
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
