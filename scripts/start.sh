#!/bin/sh
set -eu
umask 077
RUST_LOG=info node node_modules/prisma/build/index.js migrate deploy
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
