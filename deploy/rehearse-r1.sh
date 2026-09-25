#!/bin/sh
# IDEA-219 R1 rehearsal on max2. Private copy only; internal Docker network without egress;
# production container, data, cron and proxy are not touched. Prints durations/counts only.
# stdin carries the release archive, so copy the script first:
#   scp deploy/rehearse-r1.sh janpeter@192.168.0.158:/tmp/ && git archive <sha> | ssh janpeter@192.168.0.158 "sh /tmp/rehearse-r1.sh <sha>"
set -eu
umask 077
SHA="$1"; TS=$(date -u +%Y%m%dT%H%M%SZ)
R=/srv/apps/when2watch/rehearsal-r1-$TS; NET=w2w-rehearsal-$TS; DB=w2w-rehearsal-db-$TS; WEB=w2w-rehearsal-web-$TS
mkdir -m 700 "$R" "$R/private"
ms() { python3 -c 'import time;print(int(time.time()*1000))'; }
cleanup() { docker rm -f -v "$DB" "$WEB" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$R/private" "$R/src"; }
trap cleanup EXIT
echo "rehearsal $TS release $SHA"

# Source release (from git archive on stdin) and images.
mkdir -m 700 "$R/src"; tar -x -C "$R/src"
# The postgres entrypoint runs as uid 999 and must be able to read the init script.
chmod 0644 "$R/src/deploy/postgres-init.sh"
t=$(ms); docker build -q -t when2watch:r1-rehearsal-$SHA "$R/src" >/dev/null; docker build -q --target tools -t when2watch-tools:r1-rehearsal-$SHA "$R/src" >/dev/null; echo "build_ms $(( $(ms) - t ))"

# Private secrets, never printed.
python3 - "$R/private" <<'PY'
import secrets, sys, json, os
d=sys.argv[1]; s={k:secrets.token_hex(24) for k in ("su","mig","app","nextauth","cron")}
open(f"{d}/secrets.json","w").write(json.dumps(s))
PY
sec() { python3 -c "import json;print(json.load(open('$R/private/secrets.json'))['$1'])"; }
printf 'POSTGRES_PASSWORD=%s\nW2W_MIGRATOR_PASSWORD=%s\nW2W_APP_PASSWORD=%s\n' "$(sec su)" "$(sec mig)" "$(sec app)" > "$R/private/.env.db"
MIG="postgresql://when2watch_migrator:$(sec mig)@$DB:5432/when2watch"; APP="postgresql://when2watch_app:$(sec app)@$DB:5432/when2watch"
printf 'MIGRATION_DATABASE_URL=%s\n' "$MIG" > "$R/private/.env.migrate"
printf 'W2W_VERIFY_DATABASE_URL=postgresql://when2watch_migrator:%s@%s:5432/when2watch_restore\n' "$(sec mig)" "$DB" > "$R/private/.env.verify"
printf 'DATABASE_URL=%s\nNEXTAUTH_URL=https://when2watch.rehearsal.invalid\nNEXTAUTH_SECRET=%s\nCRON_SECRET=%s\n' "$APP" "$(sec nextauth)" "$(sec cron)" > "$R/private/.env.web"

docker network create --internal "$NET" >/dev/null
docker run -d --name "$DB" --network "$NET" --env-file "$R/private/.env.db" -v "$R/src/deploy/postgres-init.sh:/docker-entrypoint-initdb.d/10-when2watch.sh:ro" postgres:17 >/dev/null
ready=no; for i in $(seq 1 60); do docker exec "$DB" pg_isready -h 127.0.0.1 -U postgres -d when2watch -q 2>/dev/null && { ready=yes; break; }; sleep 1; done
[ "$ready" = yes ] || { echo "database not ready"; docker logs "$DB" 2>&1 | grep -v -i password | tail -5; exit 1; }

# Backup phase: consistent copy of the live database via the SQLite backup API (read-only on the source).
t=$(ms); python3 - "$R/private/source.db" <<'PY'
import sqlite3, sys
s=sqlite3.connect("file:/srv/apps/when2watch/data/when2watch.db?mode=ro",uri=True); d=sqlite3.connect(sys.argv[1]); s.backup(d); d.close(); s.close()
c=sqlite3.connect(f"file:{sys.argv[1]}?mode=ro",uri=True); assert c.execute("pragma integrity_check").fetchone()[0]=="ok"
PY
echo "backup_ms $(( $(ms) - t ))"

t=$(ms); docker run --rm --network "$NET" --read-only --env-file "$R/private/.env.migrate" when2watch:r1-rehearsal-$SHA sh scripts/migrate.sh >/dev/null; echo "migrate_ms $(( $(ms) - t ))"

MIG="$MIG" python3 - "$R/private" <<'PY'
import json, sys, uuid, os
d, url = sys.argv[1], os.environ["MIG"]
json.dump({"sourceSqlite":"/private/source.db","manifest":"/private/out/manifest.json","runId":str(uuid.uuid4()),"targetDatabaseUrl":url}, open(f"{d}/config.json","w"))
os.chmod(f"{d}/config.json",0o600)
PY
TOOLS="docker run --rm --network $NET -v $R/private:/private -e W2W_MIGRATION_CONFIG=/private/config.json -e NEXT_TELEMETRY_DISABLED=1 when2watch-tools:r1-rehearsal-$SHA"
echo "egress_check $($TOOLS node -e "fetch('https://api.tvmaze.com/shows/1',{signal:AbortSignal.timeout(5000)}).then(()=>console.log('OPEN')).catch(()=>console.log('blocked'))")"
echo "migrate_report $($TOOLS npx tsx scripts/migration/rehearse.ts --phase=migrate)"

# Start the new release behind "maintenance": internal network only, no proxy, no cron, synthetic app secrets.
t=$(ms); docker run -d --name "$WEB" --network "$NET" --read-only --tmpfs /tmp --user 1000:1000 --env-file "$R/private/.env.web" -e NODE_ENV=production -e TZ=Europe/Amsterdam when2watch:r1-rehearsal-$SHA >/dev/null
health() { for i in $(seq 1 60); do docker exec "$WEB" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null && return 0; sleep 1; done; return 1; }
health && echo "app_start_ms $(( $(ms) - t )) health 200"
echo "unauthenticated_shows $(docker exec "$WEB" node -e "fetch('http://127.0.0.1:3000/api/shows').then(r=>console.log(r.status))")"
echo "after_start_report $($TOOLS npx tsx scripts/migration/rehearse.ts --phase=verify)"
t=$(ms); docker restart "$WEB" >/dev/null; health && echo "restart_ms $(( $(ms) - t )) health 200"
echo "after_restart_report $($TOOLS npx tsx scripts/migration/rehearse.ts --phase=verify)"
docker rm -f "$WEB" >/dev/null

# Dump and restore into a separate database.
t=$(ms); docker exec "$DB" pg_dump -U when2watch_migrator -d when2watch -Fc -f /tmp/w2w.dump; echo "dump_ms $(( $(ms) - t )) dump_bytes $(docker exec "$DB" stat -c %s /tmp/w2w.dump)"
t=$(ms); docker exec "$DB" psql -q -U postgres -c "CREATE DATABASE when2watch_restore OWNER when2watch_migrator"
docker exec "$DB" pg_restore -U when2watch_migrator -d when2watch_restore --no-owner /tmp/w2w.dump; echo "restore_ms $(( $(ms) - t ))"
echo "restore_report $(docker run --rm --network $NET -v $R/private:/private -e W2W_MIGRATION_CONFIG=/private/config.json --env-file $R/private/.env.verify when2watch-tools:r1-rehearsal-$SHA npx tsx scripts/migration/rehearse.ts --phase=verify)"
echo "prod_container $(docker inspect -f '{{.State.Health.Status}}' when2watch-web-1) prod_image $(docker inspect -f '{{.Config.Image}}' when2watch-web-1)"
