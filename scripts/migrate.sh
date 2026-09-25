#!/bin/sh
set -eu
umask 077
# Separate release action with the DDL role; never run by the web container.
: "${MIGRATION_DATABASE_URL:?Set MIGRATION_DATABASE_URL in the private migration env file.}"
export DATABASE_URL="$MIGRATION_DATABASE_URL" RUST_LOG=info
node node_modules/prisma/build/index.js migrate deploy
# The runtime role may read migration state and import records, not rewrite them.
printf '%s\n' 'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations", "LegacyImportRun" FROM when2watch_app;' |
  node node_modules/prisma/build/index.js db execute --stdin --schema prisma/schema.prisma
