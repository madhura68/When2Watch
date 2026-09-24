#!/bin/sh
set -eu
umask 077
printf 'When2Watch cron start %s\n' "$(date --iso-8601=seconds)"
exec /usr/bin/docker exec when2watch-web-1 node scripts/cron-client.mjs
