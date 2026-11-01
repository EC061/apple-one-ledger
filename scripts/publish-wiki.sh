#!/usr/bin/env bash
set -euo pipefail

# GitHub only creates <repo>.wiki.git after the first page exists in the UI.
# Open the Wiki tab, click "Create the first page", save anything, then run this.
REPO="${1:-EC061/apple-one-ledger}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone "https://github.com/${REPO}.wiki.git" "$WORK/wiki"
cp docs/wiki/*.md "$WORK/wiki/"
cd "$WORK/wiki"
git add -A
if git diff --cached --quiet; then
  echo "wiki already up to date"
  exit 0
fi
git -c user.name="${GIT_AUTHOR_NAME:-EC061}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-ec061@users.noreply.github.com}" \
    commit -m "docs: sync wiki from docs/wiki"
git push
