# Development and CI

## Local

```bash
npm install
cp .env.example .env       # SESSION_SECRET, ADMIN_REG_CODE (12+), APP_URL
npm run dev                # http://localhost:3000
npm run typecheck
npm run build && npm start
npm run doctor             # React Doctor, must stay 100/100
```

Node ≥ 22.13 (uses built-in `node:sqlite`). OCR needs tesseract locally:

```bash
sudo apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim
brew install tesseract      # macOS; chi_sim via brew install tesseract-lang
```

Without it `/api/ocr` returns 501 and manual entry still works.

## Database

One file (`data/applecare.db`), WAL. Schema is created at boot; additive upgrades use
`ensureColumn`. There is no ORM and no migration CLI. Use a throwaway `DATA_DIR` for experiments.

## CI jobs

`.github/workflows/ci.yml` runs on every PR/push to `main`:

| Job | What it does |
| --- | --- |
| Typecheck & build | `npm ci`, `tsc --noEmit`, `next build` |
| Dependency audit | `npm audit --omit=dev --audit-level=high` |
| CodeQL | JavaScript/TypeScript, `security-and-quality` |

`react-doctor.yml` runs the scanner (blocking at `warning`). React Doctor is a floating `@v2`
action so rules update automatically; the npm dev dependency is updated by Dependabot.

## Docker publish

`.github/workflows/docker-publish.yml`:

1. `verify` (typecheck + build) gates the publish.
2. Matrix builds `linux/amd64` on `ubuntu-latest` and `linux/arm64` on `ubuntu-24.04-arm` —
   native, no QEMU — each pushing **by digest**.
3. Per-arch registry cache: `:buildcache-amd64` / `:buildcache-arm64`.
4. `merge` assembles the manifest index with `docker buildx imagetools create` and tags
   `latest`, branch, semver and `sha-<short>`.

## Branch protection

`main` is PR-only with linear history (squash/rebase, merge commits disabled), required checks
`Typecheck & build`, `Dependency audit`, `CodeQL`, `react-doctor`, admins enforced, no reviewer
requirement, force-push and deletion disabled.

Dependabot proposes grouped npm, GitHub Actions and Docker updates weekly. Merge one at a time and
rebase the rest after each.

## Repository layout

See [Architecture](Architecture). Wiki source is in `docs/wiki`; publish with
`scripts/publish-wiki.sh` after the first page exists in the GitHub UI.
