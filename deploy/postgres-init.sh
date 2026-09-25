#!/bin/sh
# First-start initialisation of the When2Watch PostgreSQL service (docker-entrypoint-initdb.d).
# Passwords come from the private .env.db; they are read by psql from the environment, not argv.
set -eu
: "${W2W_MIGRATOR_PASSWORD:?}" "${W2W_APP_PASSWORD:?}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv migrator_pw W2W_MIGRATOR_PASSWORD
\getenv app_pw W2W_APP_PASSWORD
CREATE ROLE when2watch_migrator LOGIN PASSWORD :'migrator_pw';
CREATE ROLE when2watch_app LOGIN PASSWORD :'app_pw';
CREATE DATABASE when2watch OWNER when2watch_migrator;
REVOKE ALL ON DATABASE when2watch FROM PUBLIC;
GRANT CONNECT ON DATABASE when2watch TO when2watch_app;
\connect when2watch
ALTER SCHEMA public OWNER TO when2watch_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO when2watch_app;
ALTER DEFAULT PRIVILEGES FOR ROLE when2watch_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO when2watch_app;
SQL
