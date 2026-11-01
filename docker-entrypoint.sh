#!/bin/sh
set -eu

# Bind mounts arrive owned by the host user, which is usually not uid 1001.
# Fix ownership as root, then immediately drop privileges for the app.
if [ "$(id -u)" = "0" ]; then
  DATA_DIR="${DATA_DIR:-/data}"
  mkdir -p "$DATA_DIR"
  chown -R nextjs:nodejs "$DATA_DIR" 2>/dev/null || true
  exec gosu nextjs "$@"
fi

exec "$@"
