# Deployment

## Compose

```yaml
services:
    app:
        container_name: apple-one-ledger
        image: ghcr.io/ec061/apple-one-ledger:latest
        restart: always
        init: true
        ports:
            - "127.0.0.1:18900:3000"
        environment:
            DATA_DIR: /data
            DATABASE_PATH: /data/applecare.db
            PORT: "3000"
            NODE_ENV: production
            SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET}
            ADMIN_REG_CODE: ${ADMIN_REG_CODE:?set ADMIN_REG_CODE}
            APP_URL: ${APP_URL:?set APP_URL (https://your-domain)}
        volumes:
            - ./data:/data
        security_opt:
            - no-new-privileges:true
```

The container starts as root only to `chown /data` to uid 1001, then drops privileges.

## Reverse proxy

Terminate TLS in front; the app trusts one proxy hop for `X-Forwarded-For` and uses
`X-Forwarded-Proto/Host` only when `APP_URL` is unset (it is required, so normally `APP_URL` wins).

```caddyfile
plan.example.com {
    reverse_proxy 127.0.0.1:18900
}
```

## Image tags

- `latest` — default branch
- `main`, `sha-<short>`, `vX.Y.Z` for tags
- Multi-arch index: `linux/amd64` + `linux/arm64`

Builds run on native runners (no QEMU), with per-arch registry caches
`ghcr.io/ec061/apple-one-ledger:buildcache-amd64` / `-arm64`.

## Backups

SQLite lives in `./data` with WAL. Consistent hot backup:

```bash
docker compose exec app node -e "
  const {DatabaseSync} = require('node:sqlite');
  const dest = '/data/backup-' + Date.now() + '.db';
  new DatabaseSync('/data/applecare.db').exec(\"VACUUM INTO '\" + dest + \"'\");
  console.log(dest);"
```

Copy the result off the host. Restore by stopping the container, replacing `applecare.db`, and
removing stale `-wal`/`-shm` files.

## Upgrades

```bash
docker compose pull
docker compose up -d
```

Schema changes are additive (`ensureColumn`) and run at boot. Back up first anyway.

## Package visibility

The GHCR package must be **public** for anonymous pulls, or the host must
`docker login ghcr.io` with a `read:packages` token. Visibility is changed under
GitHub → Packages → package → Package settings.
