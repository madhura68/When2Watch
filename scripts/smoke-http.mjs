import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";

// Real Next HTTP + database sessions; no Google requests or production data.
const dir = await mkdtemp(join(tmpdir(), "when2watch-http-"));
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = "https://when2watch.example.test";
const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", RUST_LOG: "info",
  DATABASE_URL: `file:${join(dir, "test.db")}`, NEXTAUTH_URL: origin,
  NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
  GOOGLE_CLIENT_ID: "http-test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "synthetic-client-secret",
  GOOGLE_CALENDAR_ID: "chosen@example.test", ALLOWED_GOOGLE_EMAIL: "owner@example.test",
  CRON_SECRET: randomBytes(32).toString("hex"),
};
const db = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
let server;
let serverOutput = "";
let assertions = 0;
function check(value, message) { assert.ok(value, message); assertions++; }
try {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, stdio: "pipe" });
  const sessions = {};
  for (const id of ["owner", "other"]) {
    sessions[id] = randomBytes(32).toString("hex");
    await db.user.create({ data: { id, email: `${id}@example.test` } });
    await db.session.create({ data: { userId: id, sessionToken: sessions[id], expires: new Date(Date.now() + 3_600_000) } });
  }
  await db.account.create({ data: { userId: "owner", type: "oauth", provider: "google", providerAccountId: "synthetic-owner", access_token: "never-serialize-access", refresh_token: "never-serialize-refresh" } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.on("data", (data) => { serverOutput += data; });
  server.stderr.on("data", (data) => { serverOutput += data; });
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: "manual", ...options });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await request("/api/health")).ok) { ready = true; break; } } catch {}
    if (server.exitCode !== null) throw new Error("Next exited before readiness");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  check(ready, "Next did not become ready");
  const cookie = (id) => ({ cookie: `__Secure-next-auth.session-token=${sessions[id]}` });
  const publicPage = await request("/");
  check(publicPage.status === 200, "login page must render");
  const publicText = await publicPage.text();
  check(!publicText.includes(env.ALLOWED_GOOGLE_EMAIL) && !publicText.includes(env.GOOGLE_CALENDAR_ID), "public page leaked private configuration");
  check((await request("/settings")).status === 307, "private page must redirect anonymous user");
  check((await request("/settings", { headers: cookie("other") })).status === 307, "private page must reject another account's session");
  const privatePage = await request("/settings", { headers: cookie("owner") });
  check(privatePage.status === 200, "valid database session must render settings");
  const privateText = await privatePage.text();
  check(privateText.includes(env.GOOGLE_CALENDAR_ID), "chosen agenda must be displayed privately");
  check(!privateText.includes("never-serialize-") && !privateText.includes(env.GOOGLE_CLIENT_SECRET), "private page leaked credentials");
  const sessionResponse = await request("/api/auth/session", { headers: cookie("owner") });
  const sessionText = await sessionResponse.text();
  check(sessionResponse.status === 200 && sessionText.includes(env.ALLOWED_GOOGLE_EMAIL), "NextAuth session route must work with current Next version");
  check(!sessionText.includes("never-serialize-") && !sessionText.includes(sessions.owner), "session endpoint leaked credentials");
  for (const [path, method] of [["/api/calendar/verify", "POST"], ["/api/probe", "POST"], ["/api/probe", "DELETE"], ["/api/shows", "POST"], ["/api/sync", "POST"]]) {
    check((await request(path, { method, headers: { origin } })).status === 401, "anonymous calendar write must be denied");
    check((await request(path, { method, headers: { ...cookie("other"), origin } })).status === 401, "other user's calendar write must be denied");
    check((await request(path, { method, headers: { ...cookie("owner"), origin: "https://attacker.example.test" } })).status === 403, "foreign-origin write must be denied before Google");
  }
  for (const path of ["/api/shows", "/api/shows/search?q=Slow"]) {
    check((await request(path)).status === 401, "anonymous show read must be denied");
    check((await request(path,{headers:cookie("other")})).status === 401, "other account's show read must be denied");
  }
  const home = await request("/",{headers:cookie("owner")});
  check(home.ok && (await home.text()).includes("Jouw series"), "signed-in home must display the series dashboard");
  const emptySearch = await request("/api/shows/search?q=",{headers:cookie("owner")});
  check(emptySearch.ok && (await emptySearch.json()).shows.length === 0, "empty search must return without a provider request");
  for(const credential of [undefined, "incorrect"]) {
    const response = await request("/api/cron/sync",{method:"POST",headers: credential ? {authorization:`Bearer ${credential}`} : {}});
    check(response.status === 401,"cron must reject absent or wrong credentials");
  }
  check(await db.syncRun.count() === 0,"denied cron must perform no sync work");
  const cron = await request("/api/cron/sync",{method:"POST",headers:{authorization:`Bearer ${env.CRON_SECRET}`}});
  check(cron.status === 200 && (await cron.json()).status === "success","authorized empty cron must use the shared service");
  check(await db.syncRun.count({where:{userId:"owner",trigger:"cron"}}) === 1,"cron must resolve the configured owner on the server");
  check((await request("/api/shows",{method:"POST",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body:JSON.stringify({showId:"x"})})).status === 400,"invalid show ID must fail before the provider");
  const invalid = await request("/api/probe", { method: "POST", headers: { ...cookie("owner"), origin, "Content-Type": "application/json" }, body: JSON.stringify({ date: "not-a-date" }) });
  check(invalid.status === 400, "invalid date must fail locally");
  const logout = await request("/api/auth/signout", { method: "POST", headers: { ...cookie("owner"), "Content-Type": "application/x-www-form-urlencoded" }, body: "json=true" });
  await logout.text();
  check(await db.session.count({ where: { sessionToken: sessions.owner } }) === 1, "logout without CSRF token must not remove the session");
  console.log(`HTTP smoke: ${assertions} assertions passed; real Next/SQLite, synthetic sessions, no Google calls.`);
} catch (error) {
  console.error(error.message);
  // No request headers or real credentials exist in this isolated smoke process.
  console.error(serverOutput.slice(-3000));
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  await db.$disconnect();
  await rm(dir, { recursive: true, force: true });
}
