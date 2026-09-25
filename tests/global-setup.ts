import { databaseUrl, execSql, migrateDeploy, templateDatabase } from "./database";

// One real `prisma migrate deploy` per run; each test clones the migrated template.
export default function setup() {
  execSql(`DROP DATABASE IF EXISTS "${templateDatabase}" WITH (FORCE)`);
  execSql(`CREATE DATABASE "${templateDatabase}"`);
  migrateDeploy(databaseUrl(templateDatabase));
  return () => execSql(`DROP DATABASE IF EXISTS "${templateDatabase}" WITH (FORCE)`);
}
