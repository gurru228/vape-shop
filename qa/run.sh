#!/bin/sh
# Start a throw-away local database + PostgREST + qa/dev-server.mjs, run the given command against
# http://localhost:8899, then stop everything. Nothing here touches the real Supabase or Telegram.
#   sh qa/run.sh node qa/account.mjs
#   SKIP_MIGRATION=followups sh qa/run.sh node qa/repeat.mjs   (as if that migration hadn't run yet)
# Needs: postgres 14 binaries in $PG_BIN, a postgrest binary in $PGRST_BIN (see qa/README.md).
set -e
cd "$(dirname "$0")/.."
PG_BIN=${PG_BIN:-/tmp/pg/root/usr/lib/postgresql/14/bin}
PGRST_BIN=${PGRST_BIN:-/tmp/pg/postgrest}
export LD_LIBRARY_PATH=${LD_LIBRARY_PATH:-/tmp/pg/root/usr/lib/aarch64-linux-gnu:/tmp/xlib/root/usr/lib/aarch64-linux-gnu}
W=${QA_DB_DIR:-/tmp/vsqa-db}
SECRET=local-test-secret-local-test-secret-123456
FRESH=${FRESH:-1}

if [ "$FRESH" = 1 ] || [ ! -d "$W/data" ]; then
  rm -rf "$W" 2>/dev/null; mkdir -p "$W"
  "$PG_BIN/initdb" -D "$W/data" -U postgres -A trust >/dev/null
fi
rm -f "$W/data/postmaster.pid" "$W"/.s.PGSQL.*
echo "[qa] starting postgres"
"$PG_BIN/pg_ctl" -D "$W/data" -o "-k $W -p 5433 -c listen_addresses=127.0.0.1" -l "$W/pg.log" -w start >/dev/null
cleanup() { kill $DEV $REST 2>/dev/null || true; "$PG_BIN/pg_ctl" -D "$W/data" -m fast stop >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
P="$PG_BIN/psql -h 127.0.0.1 -p 5433 -U postgres -v ON_ERROR_STOP=1 -q"
if [ "$FRESH" = 1 ]; then
  $P -c "create database shop"
  $P -d shop -f qa/schema-base.sql
  # SKIP_MIGRATION=followups leaves out migrations whose file name contains it (production before it ran)
  for f in supabase/migrations/*.sql; do
    case "$f" in *"${SKIP_MIGRATION:-//}"*) echo "[qa] skipping $f"; continue;; esac
    $P -d shop -f "$f" 2>&1 | grep -v NOTICE || true
  done
fi

cat > "$W/pgrst.conf" <<EOF
db-uri = "postgres://authenticator@127.0.0.1:5433/shop"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRET"
server-port = 3001
EOF
"$PGRST_BIN" "$W/pgrst.conf" > "$W/pgrst.log" 2>&1 & REST=$!
export SERVICE_JWT=$(node -e "
const c=require('crypto'),b=x=>Buffer.from(x).toString('base64url');
const h=b(JSON.stringify({alg:'HS256',typ:'JWT'})),p=b(JSON.stringify({role:'service_role'}));
console.log(h+'.'+p+'.'+c.createHmac('sha256','$SECRET').update(h+'.'+p).digest('base64url'))")
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://127.0.0.1:3001/ -H "Authorization: Bearer $SERVICE_JWT" && break; sleep 0.5; done
node qa/dev-server.mjs > "$W/dev.log" 2>&1 & DEV=$!
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null http://localhost:8899/ && break; sleep 0.5; done
echo "[qa] ready, running: $*"
"$@"
STATUS=$?
echo "--- server log (errors) ---"; grep -iE "error|\[dev\]" "$W/dev.log" | grep -v "tg skipped" | tail -20 || true
exit $STATUS
