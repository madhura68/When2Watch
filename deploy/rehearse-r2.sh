#!/bin/sh
# IDEA-219 R2 rehearsal on max2. Frozen private copy of the live PostgreSQL database; internal Docker network
# without egress; production container, data, cron and proxy are not touched. Prints durations/counts only.
#   scp deploy/rehearse-r2.sh janpeter@192.168.0.158:/tmp/ && git archive <sha> | ssh janpeter@192.168.0.158 "sh /tmp/rehearse-r2.sh <sha>"
set -eu
umask 077
SHA="$1"; TS=$(date -u +%Y%m%dT%H%M%SZ)
R=/srv/apps/when2watch/rehearsal-r2-$TS; NET=w2w-r2-rehearsal-$TS; DB=w2w-r2-rehearsal-db-$TS; WEB=w2w-r2-rehearsal-web-$TS
mkdir -m 700 "$R" "$R/private" "$R/journal"
ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
cleanup() { docker rm -f -v "$DB" "$WEB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$R/private" "$R/src" "$R/journal"; }
trap cleanup EXIT
echo "rehearsal $TS release $SHA"

mkdir -m 700 "$R/src"; tar -x -C "$R/src"; chmod 0644 "$R/src/deploy/postgres-init.sh"
t=$(ms); docker build -q -t when2watch:r2-rehearsal-$SHA "$R/src" >/dev/null; docker build -q --target tools -t when2watch-tools:r2-rehearsal-$SHA "$R/src" >/dev/null; echo "build_ms $(( $(ms) - t ))"

python3 - "$R/private" <<'PY'
import secrets, sys, json, base64
d=sys.argv[1]; s={k:secrets.token_hex(24) for k in ("su","mig","app","nextauth","cron")}; s["key"]=base64.b64encode(secrets.token_bytes(32)).decode()
open(f"{d}/secrets.json","w").write(json.dumps(s))
PY
sec() { python3 -c "import json;print(json.load(open('$R/private/secrets.json'))['$1'])"; }
printf 'POSTGRES_PASSWORD=%s\nW2W_MIGRATOR_PASSWORD=%s\nW2W_APP_PASSWORD=%s\n' "$(sec su)" "$(sec mig)" "$(sec app)" > "$R/private/.env.db"
MIG="postgresql://when2watch_migrator:$(sec mig)@$DB:5432/when2watch"; APP="postgresql://when2watch_app:$(sec app)@$DB:5432/when2watch"
KEYS="rehearsal:$(sec key)"
printf 'MIGRATION_DATABASE_URL=%s\n' "$MIG" > "$R/private/.env.migrate"
printf 'DATABASE_URL=%s\nW2W_CREDENTIAL_KEYS=%s\nW2W_DELETION_JOURNAL=/journal/deletions.jsonl\n' "$MIG" "$KEYS" > "$R/private/.env.tools"
printf 'DATABASE_URL=%s\nNEXTAUTH_URL=https://when2watch.rehearsal.invalid\nNEXTAUTH_SECRET=%s\nCRON_SECRET=%s\nW2W_CREDENTIAL_KEYS=%s\nW2W_DELETION_JOURNAL=/journal/deletions.jsonl\n' "$APP" "$(sec nextauth)" "$(sec cron)" "$KEYS" > "$R/private/.env.web"

docker network create --internal "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" --env-file "$R/private/.env.db" -v "$R/src/deploy/postgres-init.sh:/docker-entrypoint-initdb.d/10-when2watch.sh:ro" postgres:17 >/dev/null
ready=no; for i in $(seq 1 60); do docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres -d when2watch -q 2>/dev/null && { ready=yes; break; }; sleep 1; done
[ "$ready" = yes ] || { echo "database not ready"; exit 1; }

# Frozen copy: a consistent pg_dump of the live database (read-only on the source), restored as the migrator.
t=$(ms); docker exec when2watch-db-1 pg_dump -U postgres -d when2watch -Fc > "$R/private/live.dump"; echo "dump_ms $(( $(ms) - t )) dump_bytes $(stat -c %s "$R/private/live.dump")"
docker cp "$R/private/live.dump" "$DB:/tmp/live.dump" >/dev/null
t=$(ms); docker exec "$DB" pg_restore -U when2watch_migrator -d when2watch --no-owner --no-privileges /tmp/live.dump; docker exec "$DB" rm /tmp/live.dump; echo "restore_ms $(( $(ms) - t ))"
docker exec "$DB" psql -qAt -U postgres -d when2watch -c 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO when2watch_app'
SUM=$(sha256sum "$R/private/live.dump" | cut -c1-64)
echo "before $(docker exec "$DB" psql -qAt -U postgres -d when2watch -c 'SELECT json_build_object($$users$$,(SELECT count(*) FROM "User"),$$shows$$,(SELECT count(*) FROM "TrackedShow"),$$episodes$$,(SELECT count(*) FROM "Episode"),$$links$$,(SELECT count(*) FROM "CalendarEventLink"),$$sessions$$,(SELECT count(*) FROM "Session"))')"

TOOLS="docker run --rm --network $NET --user 1000:1000 -v $R/journal:/journal --env-file $R/private/.env.tools -e NEXT_TELEMETRY_DISABLED=1 when2watch-tools:r2-rehearsal-$SHA"
echo "egress_check $($TOOLS node -e "fetch('https://api.tvmaze.com/shows/1',{signal:AbortSignal.timeout(5000)}).then(()=>console.log('OPEN')).catch(()=>console.log('blocked'))")"
t=$(ms); docker run --rm --network "$NET" --read-only --env-file "$R/private/.env.migrate" when2watch:r2-rehearsal-$SHA sh scripts/migrate.sh >/dev/null; echo "expand_ms $(( $(ms) - t ))"
RUN=$(python3 -c 'import uuid;print(uuid.uuid4())')
t=$(ms); echo "backfill $($TOOLS -e W2W_BACKFILL_RUN_ID=$RUN -e W2W_BACKFILL_SOURCE_CHECKSUM=$SUM npx tsx scripts/migration/backfill-catalog.ts)"; echo "backfill_ms $(( $(ms) - t ))"
echo "backfill_retry $($TOOLS -e W2W_BACKFILL_RUN_ID=$RUN -e W2W_BACKFILL_SOURCE_CHECKSUM=$SUM npx tsx scripts/migration/backfill-catalog.ts | cut -c1-40)"
echo "verify_catalog $($TOOLS -e W2W_BACKFILL_RUN_ID=$RUN npx tsx scripts/migration/verify-catalog.ts)"
echo "encrypt $($TOOLS npx tsx scripts/migration/encrypt-credentials.ts)"
echo "encrypt_retry $($TOOLS npx tsx scripts/migration/encrypt-credentials.ts)"
echo "journal $($TOOLS npx tsx scripts/restore-privacy.ts init)"
echo "journal_retry $($TOOLS npx tsx scripts/restore-privacy.ts init 2>&1 | tail -1)"
echo "plaintext_secrets $(docker exec "$DB" psql -qAt -U postgres -d when2watch -c "SELECT (SELECT count(*) FROM \"Account\" WHERE access_token NOT LIKE 'w2w:v1:%' OR refresh_token NOT LIKE 'w2w:v1:%') + (SELECT count(*) FROM \"OAuthClientConfig\" WHERE \"clientSecret\" NOT LIKE 'w2w:v1:%')")"
echo "after $(docker exec "$DB" psql -qAt -U postgres -d when2watch -c 'SELECT json_build_object($$users$$,(SELECT count(*) FROM "User"),$$admins$$,(SELECT count(*) FROM "User" WHERE role=$$ADMIN$$),$$catalogShows$$,(SELECT count(*) FROM "CatalogShow"),$$follows$$,(SELECT count(*) FROM "UserFollow"),$$bindings$$,(SELECT count(*) FROM "CalendarBinding"),$$links$$,(SELECT count(*) FROM "CalendarEventLink"),$$linksWithoutOwner$$,(SELECT count(*) FROM "CalendarEventLink" WHERE "userId" IS NULL OR "bindingId" IS NULL),$$sessions$$,(SELECT count(*) FROM "Session"))')"

# Start behind "maintenance": internal network, no proxy, no cron; the start gate must pass.
t=$(ms); docker run -d --name "$WEB" --network "$NET" --read-only --tmpfs /tmp --user 1000:1000 -v "$R/journal:/journal" --env-file "$R/private/.env.web" -e NODE_ENV=production -e TZ=Europe/Amsterdam when2watch:r2-rehearsal-$SHA >/dev/null
health() { for i in $(seq 1 60); do docker exec "$WEB" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && return 0; sleep 1; done; docker logs "$WEB" 2>&1 | grep -i refusing | tail -3; return 1; }
health && echo "app_start_ms $(( $(ms) - t )) health 200"
echo "unauthenticated_shows $(docker exec "$WEB" node -e "fetch('http://127.0.0.1:3000/api/shows').then(r=>console.log(r.status))")"
echo "privacy_page $(docker exec "$WEB" node -e "fetch('http://127.0.0.1:3000/privacy').then(r=>console.log(r.status))")"
t=$(ms); docker restart "$WEB" >/dev/null; health && echo "restart_ms $(( $(ms) - t )) health 200"
docker rm -f "$WEB" >/dev/null
# Gate negative: without the journal the app refuses to start.
docker run -d --name "$WEB" --network "$NET" --read-only --tmpfs /tmp --user 1000:1000 --env-file "$R/private/.env.web" -e NODE_ENV=production when2watch:r2-rehearsal-$SHA >/dev/null
sleep 8; echo "gate_without_journal $(docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}}' "$WEB")"; docker rm -f "$WEB" >/dev/null

# Backup and restore after R2: dump, restore into a separate database, apply the (empty) journal.
docker exec "$DB" pg_dump -U when2watch_migrator -d when2watch -Fc -f /tmp/r2.dump
docker exec "$DB" psql -q -U postgres -c "CREATE DATABASE when2watch_restore OWNER when2watch_migrator"
t=$(ms); docker exec "$DB" pg_restore -U when2watch_migrator -d when2watch_restore --no-owner /tmp/r2.dump; echo "r2_restore_ms $(( $(ms) - t ))"
RESTORE_ENV="-e DATABASE_URL=postgresql://when2watch_migrator:$(sec mig)@$DB:5432/when2watch_restore"
echo "restore_apply $(docker run --rm --network $NET --user 1000:1000 -v $R/journal:/journal --env-file $R/private/.env.tools $RESTORE_ENV when2watch-tools:r2-rehearsal-$SHA npx tsx scripts/restore-privacy.ts apply)"
echo "restore_verify $(docker run --rm --network $NET --user 1000:1000 --env-file $R/private/.env.tools $RESTORE_ENV -e W2W_BACKFILL_RUN_ID=$RUN when2watch-tools:r2-rehearsal-$SHA npx tsx scripts/migration/verify-catalog.ts)"
echo "prod_container $(docker inspect -f '{{.State.Health.Status}}' when2watch-web-1) prod_image $(docker inspect -f '{{.Config.Image}}' when2watch-web-1)"
