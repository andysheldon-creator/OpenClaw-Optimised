#!/bin/sh
set -e

# Fix volume permissions when running as root (e.g. Railway, Render).
# Container volume mounts override build-time ownership, so /data may be
# root-owned even though the app needs to write as the 'node' user.
if [ "$(id -u)" = "0" ]; then
  if [ -d /data ]; then
    chown node:node /data
  fi
  exec runuser -u node -- "$@"
fi

exec "$@"
