import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { PrismaClient } from "@prisma/client";

// Real Next HTTP + database sessions; no Google requests or production data.
// The database is a fresh PostgreSQL database on a disposable local test server only.
const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "postgres"]);
const testServer = new URL(process.env.W2W_TEST_DATABASE_URL ?? "missing:");
if (!/^postgres(ql)?:$/.test(testServer.protocol) || !localHosts.has(testServer.hostname) || process.env.W2W_TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error("Refusing to run: set W2W_TEST_DATABASE_URL to a disposable local PostgreSQL server; production DSNs are never used.");
}
const databaseName = `w2w_test_http_${randomBytes(6).toString("hex")}`;
const databaseUrl = new URL(testServer); databaseUrl.pathname = `/${databaseName}`;
const execSql = (sql) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "execute", "--stdin", "--schema", "prisma/schema.prisma"],
  { input: sql, env: { ...process.env, DATABASE_URL: testServer.toString() }, stdio: ["pipe", "pipe", "pipe"] });
execSql(`CREATE DATABASE "${databaseName}"`);
const socket = createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = "https://when2watch.example.test";
const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", RUST_LOG: "info",
  DATABASE_URL: databaseUrl.toString(), NEXTAUTH_URL: origin,
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
  const manifestResponse = await request("/manifest.webmanifest");
  check(manifestResponse.ok && manifestResponse.headers.get("content-type")?.includes("manifest+json"), "PWA manifest must be publicly available without login");
  const manifest = await manifestResponse.json();
  check(manifest.id === "/" && manifest.start_url === "/" && manifest.scope === "/" && manifest.display === "standalone", "installed app must have a stable identity and open at Agenda");
  check(publicText.includes('rel="manifest"') && publicText.includes('rel="apple-touch-icon"'), "login page must expose installation metadata");
  for (const icon of [...manifest.icons, {src:"/icons/apple-touch-icon-180.png", sizes:"180x180"}]) {
    check(icon.src.startsWith("/icons/"), "installation artwork must stay on this origin");
    const response = await request(icon.src);
    check(response.ok && response.headers.get("content-type")?.includes("image/png"), "installation icon must load without authentication");
    const png = Buffer.from(await response.arrayBuffer());
    const [width,height] = icon.sizes.split("x").map(Number);
    check(png.subarray(1,4).toString() === "PNG" && png.readUInt32BE(16) === width && png.readUInt32BE(20) === height, "served icon dimensions must match advertised size");
  }
  check(manifest.icons.some(icon=>icon.purpose === "maskable") && manifest.icons.some(icon=>icon.purpose === "any"), "standard and maskable installations must have appropriate artwork");
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
  for (const [path, method] of [["/api/calendar/verify", "POST"], ["/api/probe", "POST"], ["/api/probe", "DELETE"], ["/api/shows", "POST"], ["/api/shows", "PATCH"], ["/api/sync", "POST"], ["/api/settings/preferences", "PATCH"], ["/api/settings/google", "POST"], ["/api/settings/calendars", "POST"], ["/api/settings/calendar", "POST"]]) {
    check((await request(path, { method, headers: { origin } })).status === 401, "anonymous calendar write must be denied");
    check((await request(path, { method, headers: { ...cookie("other"), origin } })).status === 401, "other user's calendar write must be denied");
    check((await request(path, { method, headers: { ...cookie("owner"), origin: "https://attacker.example.test" } })).status === 403, "foreign-origin write must be denied before Google");
  }
  for (const path of ["/api/shows", "/api/shows/search?q=Slow", "/api/settings/preferences", "/api/settings/google", "/api/settings/calendars"]) {
    check((await request(path)).status === 401, "anonymous show read must be denied");
    check((await request(path,{headers:cookie("other")})).status === 401, "other account's show read must be denied");
  }
  const home = await request("/",{headers:cookie("owner")});
  check(home.status === 307 && new URL(home.headers.get("location"),origin).pathname === "/settings", "first incomplete connection must lead to settings");
  check((await request("/volgen",{headers:cookie("owner")})).ok, "following must remain available before calendar confirmation");
  check((await request("/volgen")).status === 307, "following must reject anonymous visitors");
  const defaults = await request("/api/settings/preferences",{headers:cookie("owner")});
  check(defaults.ok && (await defaults.json()).agendaMonths === 1, "preferences must read a one-month default");
  check(await db.userPreferences.count() === 0,"reading preferences must not create a row");
  const preferenceRequest = body => request("/api/settings/preferences",{method:"PATCH",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body});
  for(const invalid of ["null","{broken",JSON.stringify({agendaMonths:"2"}),JSON.stringify({agendaMonths:4}),JSON.stringify({agendaMonths:2,userId:"other"}),JSON.stringify({agendaMonths:2,timeZone:"Invalid/Zone"})]) {
    check((await preferenceRequest(invalid)).status === 400,"invalid or unsupported preference input must be rejected");
  }
  check((await preferenceRequest(JSON.stringify({agendaMonths:2}))).ok,"valid month preference must save");
  check((await (await request("/api/settings/preferences",{headers:cookie("owner")})).json()).agendaMonths === 2,"preference must persist across requests");
  check(await db.userPreferences.count({where:{userId:"other"}}) === 0,"preference save must not choose another owner");
  check((await preferenceRequest(JSON.stringify({timeZone:"Pacific/Auckland"}))).ok,"valid timezone saves independently");
  check((await (await request("/api/settings/preferences",{headers:cookie("owner")})).json()).agendaMonths === 2,"timezone edit preserves horizon");
  const safeSettings = await request("/api/settings/google",{headers:cookie("owner")});
  const safeText = await safeSettings.text();
  check(safeSettings.ok && JSON.parse(safeText).calendarPermission === false,"identity-only session can open permission recovery");
  check(!safeText.includes("never-serialize") && !safeText.includes(env.GOOGLE_CLIENT_SECRET) && !safeText.includes(sessions.owner),"settings API must not serialize tokens, secret or session");
  check((await request("/api/settings/calendars",{headers:cookie("owner")})).status === 409,"missing calendar scopes must fail before contacting Google");
  const googleRequest = body => request("/api/settings/google",{method:"POST",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body:JSON.stringify(body)});
  check((await googleRequest({action:"begin",mode:"calendar",userId:"other"})).status === 400,"caller cannot choose another owner for Google connection");
  const begun = await googleRequest({action:"begin",mode:"calendar"});
  check(begun.ok && begun.headers.get("set-cookie")?.includes("HttpOnly"),"connection begin binds a private HTTP-only cookie");
  const pending = await db.googleConnectionAttempt.findFirstOrThrow({where:{ownerId:"owner",status:"pending"}});
  check(!pending.tokensJson && pending.sessionHash !== sessions.owner,"pending connection stores only session hash and no active token copy");
  check((await googleRequest({action:"cancel",id:pending.id})).ok,"owner can cancel an incomplete connection");
  check((await db.googleConnectionAttempt.findUniqueOrThrow({where:{id:pending.id}})).status === "cancelled","cancellation persists");
  check((await db.installation.findUniqueOrThrow({where:{id:"singleton"}})).ownerId === "owner","legacy owner imported without changing identity");
  check(await db.oAuthClientConfig.count() === 1,"legacy client import is idempotent across requests");
  for (const path of ["/api/shows","/api/settings/google","/api/settings/preferences"]) {
    check((await request(path,{headers:cookie("owner")})).headers.get("cache-control")?.includes("no-store"),"private API responses must not be cached between users");
  }
  // An ACTIVE non-admin cannot replace the central OAuth client.
  await db.user.update({where:{id:"other"},data:{accessStatus:"ACTIVE"}});
  const replace = await request("/api/settings/google",{method:"POST",headers:{...cookie("other"),origin,"Content-Type":"application/json"},body:JSON.stringify({action:"begin",mode:"replace-client",clientId:"x.apps.googleusercontent.com",clientSecret:"y"})});
  check(replace.status === 403,"only an admin may replace the OAuth client");
  await db.user.update({where:{id:"other"},data:{accessStatus:"UNCLAIMED"}});
  // P6: invitations and user administration.
  for (const path of ["/api/admin/users","/api/admin/invitations"]) {
    check((await request(path)).status === 401 && (await request(path,{headers:cookie("other")})).status === 401,"admin endpoints reject anonymous and unclaimed sessions");
    check((await request(path,{headers:cookie("owner")})).ok,"admin can read user administration");
  }
  await db.user.update({where:{id:"other"},data:{accessStatus:"ACTIVE"}});
  check((await request("/api/admin/users",{headers:cookie("other")})).status === 403,"ordinary user gets no admin endpoint");
  check((await request("/beheer/gebruikers",{headers:cookie("other")})).status === 307,"ordinary user is redirected away from the admin page");
  await db.user.update({where:{id:"other"},data:{accessStatus:"UNCLAIMED"}});
  const invitationPage = await request("/uitnodiging");
  const invitationHtml = await invitationPage.text();
  check(invitationPage.ok && invitationPage.headers.get("referrer-policy") === "no-referrer","invitation page is public and sends no referrer");
  check(![...invitationHtml.matchAll(/(?:src|href)="(https?:)?\/\/[^"]*"/g)].length,"invitation page loads no external assets");
  const invited = await request("/api/admin/invitations",{method:"POST",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body:JSON.stringify({email:"invited@example.test"})});
  const { link } = await invited.json();
  const sentinel = new URL(link).hash.replace("#token=","");
  check(invited.ok && new URL(link).pathname === "/uitnodiging" && !new URL(link).search && sentinel.length === 43,"invitation link carries the token only in the fragment");
  check(!(await (await request("/api/admin/invitations",{headers:cookie("owner")})).text()).includes(sentinel),"invitation list never repeats the token");
  const exchange = token => request("/api/invitations/exchange",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify({token})});
  check((await exchange("x".repeat(43))).status === 400,"unknown invitation token is refused neutrally");
  const exchanged = await exchange(sentinel);
  check(exchanged.ok && exchanged.headers.get("set-cookie")?.includes("HttpOnly") && exchanged.headers.get("set-cookie")?.includes("SameSite=Lax"),"exchange sets an HTTP-only browser-flow cookie");
  check(!exchanged.headers.get("set-cookie")?.includes(sentinel) && (await db.invitation.findFirstOrThrow({where:{email:"invited@example.test"}})).acceptedAt === null,"exchange stores no token and claims nothing");
  check((await request("/api/invitations/exchange",{method:"POST",headers:{origin:"https://attacker.example.test","Content-Type":"application/json"},body:JSON.stringify({token:sentinel})})).status === 403,"exchange requires same origin");
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
  const ownerAccount = await db.account.findFirstOrThrow({where:{userId:"owner"}});
  await db.calendarBinding.create({data:{userId:"owner",accountId:ownerAccount.id,calendarId:env.GOOGLE_CALENDAR_ID,status:"ACTIVE",provenance:"LEGACY_UNVERIFIED",summary:"When2Watch",timeZone:"Europe/Amsterdam",accessRole:"owner",defaultRemindersJson:"[]",confirmedAt:new Date()}});
  const synopsis = "OWNER_DETAILS Een zorgvuldig opgeslagen omschrijving. ".repeat(15);
  const show = await db.trackedShow.create({data:{userId:"owner",tvmazeId:45039,title:"Slow Horses",sourceUrl:"https://www.tvmaze.com/shows/45039",status:"Running",summaryText:synopsis,genresJson:'["Drama","Thriller"]',runtimeMinutes:45}});
  await db.episode.create({data:{trackedShowId:show.id,sourceId:3643507,title:"Resurrection",season:6,number:3,airdate:"2099-09-30",sourceUrl:"https://www.tvmaze.com/episodes/3643507",summaryText:'PRIVATE_EPISODE <img src="https://example.test/should-not-load" onerror="alert(1)"> & tekst'}});
  const ownerShows = await request("/api/shows",{headers:cookie("owner")});
  const ownerData = await ownerShows.json();
  const changeTrying = body => request("/api/shows",{method:"PATCH",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body});
  check(ownerData.shows[0].trying === false,"existing series defaults to following");
  const changed = await changeTrying(JSON.stringify({showId:"45039",trying:true}));
  check(changed.ok && (await changed.json()).trying === true,"owner can mark an existing show as trying");
  check((await (await request("/api/shows",{headers:cookie("owner")})).json()).shows[0].trying === true,"trying survives another HTTP request");
  for (const invalid of ["null","{broken",JSON.stringify({showId:"45039"}),JSON.stringify({showId:45039,trying:true}),JSON.stringify({showId:"45039",trying:"true"}),JSON.stringify({showId:"45039",trying:true,userId:"other"})]) {
    check((await changeTrying(invalid)).status === 400,"invalid trying input must be rejected");
  }
  check((await changeTrying(JSON.stringify({showId:"99998",trying:true}))).status === 404,"changing an untracked show must not add it");
  const foreignShow = await db.trackedShow.create({data:{userId:"other",tvmazeId:99997,title:"Foreign",sourceUrl:"https://www.tvmaze.com/shows/99997",status:"Ended"}});
  check((await changeTrying(JSON.stringify({showId:"99997",trying:true}))).status === 404,"owner cannot change a show belonging to another user");
  check((await db.trackedShow.findUniqueOrThrow({where:{id:foreignShow.id}})).trying === false,"foreign preference stays unchanged");
  for (const trying of ["true",1,null,{}]) {
    check((await request("/api/shows",{method:"POST",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body:JSON.stringify({showId:"45039",trying})})).status === 400,"POST rejects invalid trying before any provider request");
  }
  check(await db.syncRun.count() === 1,"preference changes do not start provider synchronization");

  check(ownerShows.ok && ownerData.shows[0].summaryText === synopsis && ownerData.shows[0].runtimeMinutes === 45 && ownerData.shows[0].genres.join(",") === "Drama,Thriller", "owner must receive locally stored series metadata");
  check(ownerData.shows[0].upcoming[0].summaryText.startsWith("PRIVATE_EPISODE"), "owner must receive locally stored episode text");
  for(const identity of [null,"other"]){
    const headers=identity?cookie(identity):{};
    for(const path of ["/","/volgen","/api/shows"]){
      const response=await request(path,{headers}); const body=await response.text();
      check(!body.includes("OWNER_DETAILS") && !body.includes("PRIVATE_EPISODE"), "anonymous or other account must not receive enriched data");
    }
  }
  const detailsPage = await (await request("/volgen",{headers:cookie("owner")})).text();
  const excerpt=detailsPage.match(/<p class="series-synopsis">([\s\S]*?)<\/p>/)?.[1];
  check(excerpt && excerpt.length <= 400 && excerpt.endsWith("…") && synopsis.startsWith(excerpt.slice(0,-1)) && /\s/.test(synopsis[excerpt.length-1]), "long synopsis must end at a word boundary within 400 characters");
  check(detailsPage.includes("Lees verder op TVmaze"), "truncated synopsis must link to its source");
  check(detailsPage.includes('class="series-details"') && detailsPage.includes('class="episode-description"') && !/<details[^>]*\sopen(?:[=>\s])/.test(detailsPage), "series and episode disclosures must initially be closed");
  check(detailsPage.includes("&lt;img") && !detailsPage.includes('<img src="https://example.test/should-not-load"'), "stored text must render escaped instead of executable markup");
  const soon = new Date(Date.now()+2*86400_000).toISOString().slice(0,10);
  await db.episode.create({data:{trackedShowId:show.id,sourceId:999999,title:"SOON_EPISODE",season:6,number:99,airdate:soon,sourceUrl:"https://www.tvmaze.com/episodes/999999",summaryText:"HIDDEN_SPOILER"}});
  for(const path of ["/","/volgen","/settings"]){
    const page = await request(path,{headers:cookie("owner")});const html=await page.text();
    check(page.ok && html.includes('aria-label="Hoofdnavigatie"'),"all private pages need the shared menu");
    const active=html.match(/<a[^>]*aria-current="page"[^>]*>/)?.[0];
    check(active?.includes(`href="${path}"`),"menu must identify the active route");
    if(path==="/") {
      check(html.includes("SOON_EPISODE") && !html.includes("PRIVATE_EPISODE"),"Agenda must show the in-window episode and exclude distant episodes");
      check(html.includes("/images/when2watch-banner.svg"),"Agenda must show the generic banner");
      check(!/<details[^>]*\sopen(?:[=>\s])/.test(html),"Agenda spoilers must start closed");
    }
  }
  const banner = await request("/images/when2watch-banner.svg");
  check(banner.ok && banner.headers.get("content-type")?.includes("image/svg+xml"),"generic banner must be served as an image");
  const selectedBanner="https://static.tvmaze.com/uploads/images/medium_leaderboard/595/1489665.jpg";
  const selectedBackground="https://static.tvmaze.com/uploads/images/original_untouched/631/1577977.jpg";
  const selectedPoster="https://static.tvmaze.com/uploads/images/medium_portrait/637/1592971.jpg";
  const nextArtworkCheck=new Date(Date.now()+7*86400_000);
  await db.trackedShow.update({where:{id:show.id},data:{bannerUrl:selectedBanner,backgroundUrl:selectedBackground,poster:selectedPoster,bannerNextCheckAt:nextArtworkCheck}});
  const artwork=(await (await request("/api/shows",{headers:cookie("owner")})).json()).shows[0];
  check(artwork.bannerUrl === selectedBanner && artwork.backgroundUrl === selectedBackground && artwork.poster === selectedPoster,"overview must serve all stored artwork choices");
  for(let visit=0;visit<2;visit++) check((await (await request("/",{headers:cookie("owner")})).text()).includes(`src="${selectedBanner}"`),"repeated Agenda reads must render the stored banner");
  await db.trackedShow.update({where:{id:show.id},data:{bannerUrl:null}});
  check((await (await request("/",{headers:cookie("owner")})).text()).includes(`src="${selectedBackground}"`),"Agenda must render the stored background without a banner");
  await db.trackedShow.update({where:{id:show.id},data:{backgroundUrl:null}});
  check((await (await request("/",{headers:cookie("owner")})).text()).includes(`src="${selectedPoster}"`),"Agenda must render the existing poster without landscape artwork");
  check((await db.trackedShow.findUniqueOrThrow({where:{id:show.id}})).bannerNextCheckAt.getTime() === nextArtworkCheck.getTime(),"page reads must preserve the image cache deadline");
  check(await db.syncRun.count() === 1,"reading enriched pages must not start a sync");
  check((await request("/api/shows",{method:"POST",headers:{...cookie("owner"),origin,"Content-Type":"application/json"},body:JSON.stringify({showId:"x"})})).status === 400,"invalid show ID must fail before the provider");
  const invalid = await request("/api/probe", { method: "POST", headers: { ...cookie("owner"), origin, "Content-Type": "application/json" }, body: JSON.stringify({ date: "not-a-date" }) });
  check(invalid.status === 400, "invalid date must fail locally");
  await new Promise(resolve => { server.once("exit", resolve); server.kill("SIGTERM"); });
  server = spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{env:{...env,ALLOWED_GOOGLE_EMAIL:"wrong@example.test",GOOGLE_CLIENT_SECRET:"wrong-after-import",GOOGLE_CALENDAR_ID:"wrong-after-import"},stdio:["ignore","pipe","pipe"]});
  server.stdout.on("data",data=>{serverOutput+=data;}); server.stderr.on("data",data=>{serverOutput+=data;});
  let restarted=false;
  for(let attempt=0;attempt<80;attempt++){try{if((await request("/api/health")).ok){restarted=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,100));}
  check(restarted,"Next must restart with the persisted installation");
  const restartedSettings = await (await request("/api/settings/google",{headers:cookie("owner")})).json();
  check(restartedSettings.account.email === env.ALLOWED_GOOGLE_EMAIL && restartedSettings.calendar.id === env.GOOGLE_CALENDAR_ID,"stored account/calendar win over changed environment after restart");
  check(restartedSettings.preferences.timeZone === "Pacific/Auckland" && restartedSettings.preferences.agendaMonths === 2,"preferences survive an actual server restart");
  check(!serverOutput.includes("never-serialize-") && !serverOutput.includes(env.GOOGLE_CLIENT_SECRET) && !serverOutput.includes(sessions.owner),"server logs must not expose secrets");
  check(!serverOutput.includes(sentinel),"sentinel invitation token never appears in server logs, on success or failure");
  const logout = await request("/api/auth/signout", { method: "POST", headers: { ...cookie("owner"), "Content-Type": "application/x-www-form-urlencoded" }, body: "json=true" });
  await logout.text();
  check(await db.session.count({ where: { sessionToken: sessions.owner } }) === 1, "logout without CSRF token must not remove the session");
  console.log(`HTTP smoke: ${assertions} assertions passed; real Next/PostgreSQL, synthetic sessions, no Google calls.`);
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
  execSql(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
}
