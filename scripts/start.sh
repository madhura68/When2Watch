#!/bin/sh
set -eu
umask 077
# Migrations are a separate release step with DDL credentials (scripts/migrate.sh).
# The runtime only verifies that it talks to a fully migrated PostgreSQL database.
case "${DATABASE_URL:-}" in
  postgresql://*|postgres://*) ;;
  *) echo "Refusing to start: DATABASE_URL must point to PostgreSQL." >&2; exit 64 ;;
esac
if ! RUST_LOG=info node node_modules/prisma/build/index.js migrate status >/dev/null 2>&1; then
  echo "Refusing to start: database schema is not ready. Run the migration step first." >&2
  exit 65
fi
# IDEA-219 R2: backfill, sealed secrets and the deletion journal must be in place before serving.
node scripts/ready-r2.mjs || exit 66
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
