/** Explicit, isolated B0 operator probe. Never runs in the production app. */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import NextAuthModule, { type Account, type NextAuthOptions } from "next-auth";
import GoogleModule from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { GoogleCalendar, type CalendarEvent } from "../src/server/google-calendar";
import { googleTokenRefresher } from "../src/server/google-tokens";
import { calendarScopes } from "../src/server/auth-policy";
import { nextDate } from "../src/lib/dates";
import { AppError } from "../src/server/errors";
import { isolatedProbeDatabase, probeAttemptReady, probeAuthFailure } from "./google-probe-guards";

if (!process.argv.includes("--authorized-configuration-probe")) throw Error("Explicit --authorized-configuration-probe is required.");
const configPath = process.env.W2W_GOOGLE_PROBE_CONFIG;
if (!configPath || !isAbsolute(configPath)) throw Error("Set W2W_GOOGLE_PROBE_CONFIG to an absolute private JSON path.");
if ((statSync(configPath).mode & 0o077) !== 0) throw Error("The private probe configuration must have mode 0600.");
process.umask(0o077);
const settings = JSON.parse(readFileSync(configPath, "utf8")) as { emails: string[]; credentials: string[] };
if (settings.emails?.length !== 2 || new Set(settings.emails).size !== 2 || settings.emails.some(email => typeof email !== "string" || !email.includes("@"))) throw Error("Exactly two explicitly supplied probe accounts are required.");
if (!Array.isArray(settings.credentials) || settings.credentials.length < 1 || settings.credentials.length > 2 || settings.credentials.some(path => !isAbsolute(path))) throw Error("Supply one or two explicit credential file paths.");
const clients = settings.credentials.map(path => {
  const client = JSON.parse(readFileSync(path, "utf8")).web;
  if (!client?.client_id || !client.client_secret) throw Error("A web OAuth client is required.");
  return { clientId: String(client.client_id), clientSecret: String(client.client_secret) };
});
if (clients.length === 2 && clients[0].clientId === clients[1].clientId) throw Error("Client replacement requires two different OAuth clients.");
const privateDir = join(dirname(configPath), "google-probe-state");
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
if ((statSync(privateDir).mode & 0o077) !== 0) throw Error("The private probe directory must have mode 0700.");
const statePath = join(privateDir, "state.json");
// A separate local PostgreSQL probe database (name contains "probe"), never the production DSN.
const probeUrl = isolatedProbeDatabase(process.env.W2W_PROBE_DATABASE_URL, process.env.DATABASE_URL);
const origin = "http://localhost:3401", creationScope = "https://www.googleapis.com/auth/calendar.app.created";
const sessionCookie = "w2w-probe.session-token";
type Connection = Pick<Account, "providerAccountId" | "access_token" | "refresh_token" | "expires_at" | "scope"> & { client: number };
type Attempt = { id: string; mode: string; sessionHash: string | null; client: number; email: string; expires: number; scopes: string[]; completed?: boolean };
type ProbeCalendar = { phase: "sending" | "ready"; id?: string; connection: string; name: string };
type State = {
  secret: string; csrf: string; ownerId?: string; active?: string; candidate?: string; proposed?: string;
  connections: Record<string, Connection>; attempt?: Attempt; calendars: Partial<Record<"source" | "target", ProbeCalendar>>;
  event?: { source: string; target: string; date: string; targetConfirmed?: boolean; sourceDeleted?: boolean; targetDeleted?: boolean };
  observations: Record<string, unknown>[];
};
const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {
  secret: randomBytes(32).toString("hex"), csrf: randomBytes(32).toString("hex"), connections: {}, calendars: {}, observations: [],
};
function save() { writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); renameSync(`${statePath}.tmp`, statePath); }
function observe(kind: string, detail: Record<string, unknown> = {}) { state.observations.push({ at: new Date().toISOString(), kind, ...detail }); save(); }
save();
const freshState = !existsSync(statePath);
execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: probeUrl, RUST_LOG: "info" }, stdio: "pipe" });
const db = new PrismaClient({ datasourceUrl: probeUrl });
if (freshState && await db.user.count() > 0) throw Error("Refusing an existing probe database without probe state.");
process.env.NEXTAUTH_URL = origin;
const NextAuth = (NextAuthModule as unknown as { default?: typeof NextAuthModule }).default ?? NextAuthModule;
const GoogleProvider = (GoogleModule as unknown as { default?: typeof GoogleModule }).default ?? GoogleModule;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const cookies = (req: IncomingMessage) => Object.fromEntries((req.headers.cookie ?? "").split(";").map(part => part.trim().split(/=(.*)/s)).filter(parts => parts[0]).map(([name, value]) => [name, decodeURIComponent(value ?? "")]));
async function ownerSession(req: IncomingMessage) {
  const token = cookies(req)[sessionCookie];
  if (!token) return null;
  const session = await db.session.findUnique({ where: { sessionToken: token } });
  return session && session.userId === state.ownerId && session.expires > new Date() ? { id: session.userId, hash: hash(token) } : null;
}
const scopesFor = (mode: string) => ["openid", "email", "profile", ...(["owner", "reconnect"].includes(mode) ? [] : calendarScopes), ...(["create", "candidate", "replace-client"].includes(mode) ? [creationScope] : [])];
function options(req: IncomingMessage): NextAuthOptions {
  const attempt = state.attempt, client = clients[attempt?.client ?? 0];
  return {
    secret: state.secret, adapter: PrismaAdapter(db), session: { strategy: "database" }, debug: false,
    cookies: { sessionToken: { name: sessionCookie, options: { httpOnly: true, sameSite: "lax", path: "/", secure: false } } },
    providers: [GoogleProvider({ ...client, checks: ["pkce", "state"], authorization: { params: {
      scope: (attempt?.scopes ?? ["openid", "email", "profile"]).join(" "), access_type: "offline", prompt: "consent select_account", include_granted_scopes: "true", login_hint: attempt?.email,
    } } })],
    pages: { error: "/" },
    callbacks: {
      async signIn({ account, profile }) {
        const current = state.attempt, session = await ownerSession(req);
        if (!current || !probeAttemptReady(current, cookies(req)["w2w-probe.attempt"], session?.hash ?? null, !!state.ownerId)) return false;
        const google = profile as { email?: string; email_verified?: boolean } | undefined;
        if (account?.provider !== "google" || google?.email_verified !== true || google.email?.toLowerCase() !== current.email.toLowerCase()) return false;
        if (state.active && current.mode !== "candidate" && account.providerAccountId !== state.connections[state.active].providerAccountId) return false;
        return true;
      },
      async session({ session, user }) { session.user = { id: user.id, email: user.email, name: user.name }; return session; },
    },
    events: {
      async signIn({ user, account }) {
        if (!account || !state.attempt) throw Error("Missing validated probe callback.");
        if (state.ownerId && user.id !== state.ownerId) throw Error("NextAuth did not preserve the internal owner.");
        const key = randomUUID(), previous = Object.values(state.connections).find(connection => connection.client === state.attempt!.client && connection.providerAccountId === account.providerAccountId);
        state.connections[key] = { providerAccountId: account.providerAccountId, client: state.attempt.client,
          access_token: account.access_token, refresh_token: account.refresh_token || previous?.refresh_token,
          expires_at: account.expires_at, scope: account.scope };
        const sameOwner = !!state.ownerId;
        state.ownerId = user.id;
        if (!state.active) state.active = key;
        else state.proposed = key;
        state.attempt.completed = true;
        observe("real-nextauth-callback", { mode: state.attempt.mode, sameInternalOwner: sameOwner, accountCount: await db.account.count({ where: { userId: user.id } }),
          grantedScopes: (account.scope ?? "").split(/\s+/).sort(), hasRefreshToken: !!state.connections[key].refresh_token, activeUnchanged: state.active !== key });
      },
    },
    logger: { error(code, metadata) { observe("auth-error", { code, reason: probeAuthFailure(metadata) }); }, warn(code) { observe("auth-warning", { code }); }, debug() {} },
  };
}
async function accessToken(key: string): Promise<string> {
  const connection = state.connections[key];
  if (!connection) throw Error("No selected probe connection.");
  if (connection.access_token && (connection.expires_at ?? 0) * 1000 > Date.now() + 60_000) return connection.access_token;
  if (!connection.refresh_token) throw Error("Reconnect this probe account.");
  const client = clients[connection.client], tokens = await googleTokenRefresher(client.clientId, client.clientSecret)(connection.refresh_token);
  if (!tokens.access_token || !tokens.expiry_date) throw Error("Refresh did not return usable tokens.");
  connection.access_token = tokens.access_token; connection.expires_at = Math.floor(tokens.expiry_date / 1000);
  if (tokens.refresh_token) connection.refresh_token = tokens.refresh_token;
  observe("token-refresh", { client: connection.client }); return tokens.access_token;
}
const google = (key: string) => new GoogleCalendar(() => accessToken(key));
// Preserve field presence/types while replacing private identifiers and content.
function sanitize(input: unknown, key = ""): unknown {
  if (Array.isArray(input)) return input.map(value => sanitize(value, key));
  if (input && typeof input === "object") return Object.fromEntries(Object.entries(input).map(([name,value]) => [name, sanitize(value,name)]));
  if (typeof input !== "string") return input;
  if (["kind", "accessRole", "timeZone", "method", "status", "transparency", "visibility", "eventType", "date", "dateTime", "app", "probe", "colorId", "backgroundColor", "foregroundColor"].includes(key)) return input;
  if (["created", "updated"].includes(key)) return input;
  return `redacted-${key || "value"}-${hash(input).slice(0, 8)}`;
}
const fixtureDir = resolve("tests/fixtures/google");
function fixture(name: string, body: unknown) { mkdirSync(fixtureDir, { recursive: true }); writeFileSync(join(fixtureDir, `${name}.json`), `${JSON.stringify(sanitize(body), null, 2)}\n`); }
async function api(key: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken(key)}` }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new AppError("PROBE_PROVIDER_ERROR", response.status, "Google heeft deze proefactie niet bevestigd.");
  return response.json();
}
async function calendars(key: string, label: string) {
  let pageToken: string | undefined; const seen = new Set<string>(), result: { id: string; accessRole: string }[] = []; let pages = 0;
  do {
    const query = new URLSearchParams({ maxResults: "1", minAccessRole: "writer" }); if (pageToken) query.set("pageToken", pageToken);
    const page = await api(key, `users/me/calendarList?${query}`); fixture(`calendar-list-${label}-${++pages}`, page);
    if (page.items !== undefined && !Array.isArray(page.items)) throw Error("Malformed CalendarList.");
    result.push(...(page.items ?? []).filter((item: { accessRole: string }) => ["owner", "writer"].includes(item.accessRole)));
    pageToken = page.nextPageToken;
    if (pageToken && (typeof pageToken !== "string" || seen.has(pageToken))) throw Error("Repeated CalendarList page.");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);
  observe("calendar-list", { label, pages, writableCount: result.length }); return result;
}
async function createCalendar(role: "source" | "target") {
  const key = role === "source" ? state.active : state.candidate;
  if (!key || ![...calendarScopes, creationScope].every(scope => state.connections[key].scope?.split(/\s+/).includes(scope))) throw Error("Grant all three probe Calendar scopes first.");
  if (state.calendars[role]) throw Error("This calendar creation was already sent; inspect its recorded outcome instead of repeating it.");
  const name = `When2Watch proef ${role} ${new Date().toISOString().slice(0,10)} ${randomBytes(3).toString("hex")}`;
  state.calendars[role] = { phase: "sending", connection: key, name }; save();
  const created = await api(key, "calendars", { method: "POST", body: JSON.stringify({ summary: name, timeZone: "Europe/Amsterdam", description: "Herkenbare When2Watch B0-proefagenda; geen echte afleveringen." }) });
  if (typeof created.id !== "string" || created.summary !== name) throw Error("Creation response is not the requested calendar.");
  state.calendars[role]!.id = created.id; save(); fixture(`calendar-created-${role}`, created);
  const list = await calendars(key, role), item = await google(key).calendar(created.id);
  if (!list.some(calendar => calendar.id === created.id) || item.timeZone !== "Europe/Amsterdam") throw Error("New calendar is not verified in CalendarList.");
  state.calendars[role]!.phase = "ready"; observe("calendar-created-and-listed", { role, timeZone: item.timeZone, accessRole: item.accessRole });
}
function marked(event: CalendarEvent) { return event.extendedProperties?.private?.app === "when2watch" && event.extendedProperties.private.probe === "configuration-b0" && event.extendedProperties.private.owner === state.ownerId; }
async function ensureEvent(role: "source" | "target") {
  const calendar = state.calendars[role]!, id = state.event![role], date = state.event!.date, client = google(calendar.connection);
  let event: CalendarEvent;
  try { event = await client.event(calendar.id!, id); }
  catch (error) {
    if (!(error instanceof AppError) || error.status !== 404) throw error;
    await client.insert(calendar.id!, { id, summary: "When2Watch configuratieproef — geen echte aflevering", start: { date }, end: { date: nextDate(date) },
      reminders: { useDefault: false }, extendedProperties: { private: { app: "when2watch", probe: "configuration-b0", owner: state.ownerId! } } });
    event = await client.event(calendar.id!, id);
  }
  if (!marked(event) || !event.etag || event.status === "cancelled" || event.start.date !== date || event.end.date !== nextDate(date)) throw Error("Probe event readback/ownership failed.");
  fixture(`event-confirmed-${role}`, event); return event;
}
async function moveEvent() {
  if (!state.calendars.source?.id || !state.calendars.target?.id) throw Error("Create and verify both probe calendars first.");
  if (!state.event) { state.event = { source: `e${randomUUID().replaceAll("-", "")}`, target: `e${randomUUID().replaceAll("-", "")}`, date: new Date(Date.now()+7*86400_000).toISOString().slice(0,10) }; save(); }
  if (state.event.sourceDeleted) throw Error("Move already verified; use readback or cleanup.");
  const source = await ensureEvent("source"); await ensureEvent("target");
  state.event.targetConfirmed = true; observe("target-confirmed-before-source-delete");
  const calendar = state.calendars.source, client = google(calendar.connection);
  await client.remove(calendar.id!, source.id, source.etag!);
  try { const readback = await client.event(calendar.id!, source.id); if (readback.status !== "cancelled") throw Error("Source delete not confirmed."); fixture("event-source-after-delete", readback); }
  catch (error) { if (!(error instanceof AppError) || ![404,410].includes(error.status)) throw error; }
  state.event.sourceDeleted = true; observe("source-delete-confirmed", { targetWasConfirmed: state.event.targetConfirmed });
}
async function readback() {
  for (const role of ["source", "target"] as const) {
    const calendar = state.calendars[role]; if (!calendar?.id) continue;
    const list = await calendars(calendar.connection, `${role}-readback`);
    if (!list.some(item => item.id === calendar.id)) throw Error("Recorded probe calendar missing.");
    const info = await google(calendar.connection).calendar(calendar.id);
    observe("calendar-readback", { role, accessRole: info.accessRole, timeZone: info.timeZone });
  }
  if (state.active && state.proposed && state.attempt?.mode === "replace-client") {
    await calendars(state.active, "old-client-still-works");
    await calendars(state.proposed, "new-client-candidate");
    observe("old-and-new-client-work-before-confirmation");
  }
}
async function cleanupTarget() {
  if (!state.event?.targetConfirmed || state.event.targetDeleted || !state.calendars.target?.id) throw Error("No confirmed remaining target probe item.");
  const calendar = state.calendars.target, client = google(calendar.connection), event = await client.event(calendar.id!, state.event.target);
  if (!marked(event) || !event.etag) throw Error("Refusing cleanup of an unverified item.");
  await client.remove(calendar.id!, event.id, event.etag);
  const readback = await client.event(calendar.id!, event.id);
  if (readback.status !== "cancelled") throw Error("Target cleanup not confirmed.");
  state.event.targetDeleted = true; observe("target-cleanup-confirmed");
}
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
function form(action: string, label: string, value: string) { return `<form method="post" action="${action}"><input type="hidden" name="csrf" value="${state.csrf}"><button name="action" value="${escape(value)}">${escape(label)}</button></form>`; }
async function body(req: IncomingMessage) { let text = ""; for await (const chunk of req) { text += chunk; if (text.length > 16_384) throw Error("Request too large."); } return Object.fromEntries(new URLSearchParams(text)); }
function redirect(res: ServerResponse, path: string) { res.writeHead(303, { Location: path }); res.end(); }
let lane = Promise.resolve();
async function handle(req: IncomingMessage, res: ServerResponse) {
  if (req.headers.host !== "localhost:3401") { res.writeHead(403); res.end(); return; }
  // no-referrer also nulls Origin on native form POSTs, rejecting our own forms.
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "same-origin"); res.setHeader("X-Frame-Options", "DENY");
  const url = new URL(req.url!, origin), session = await ownerSession(req);
  if (url.pathname.startsWith("/api/auth/")) {
    if (/^\/api\/auth\/(signin|callback)(\/|$)/.test(url.pathname) && !probeAttemptReady(state.attempt, cookies(req)["w2w-probe.attempt"], session?.hash ?? null, !!state.ownerId)) {
      redirect(res,"/?restart=1"); return;
    }
    if (url.pathname === "/api/auth/callback/google") observe("callback-arrived", {
      hasStateCookie: !!cookies(req)["next-auth.state"], hasPkceCookie: !!cookies(req)["next-auth.pkce.code_verifier"],
      hasCode: url.searchParams.has("code"), hasProviderError: url.searchParams.has("error"),
    });
    const query = Object.fromEntries(url.searchParams);
    const request = Object.assign(req, { query: { ...query, nextauth: url.pathname.slice(10).split("/") }, cookies: cookies(req), body: req.method === "POST" ? await body(req) : undefined });
    const response = Object.assign(res, { status(code: number) { res.statusCode = code; return response; }, json(value: unknown) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(value)); }, send(value: unknown) { if (typeof value === "string") res.end(value); else response.json(value); } });
    await NextAuth(request as never, response as never, options(req)); return;
  }
  if (req.method === "POST") {
    const input = await body(req);
    if (req.headers.origin !== origin || input.csrf !== state.csrf) {
      observe("probe-mutation-denied", { sameOrigin: req.headers.origin === origin, hasCsrf: !!input.csrf, csrfMatches: input.csrf === state.csrf });
      res.writeHead(403,{"Content-Type":"text/html; charset=utf-8"});
      res.end('<p>Deze browseraanvraag kon niet worden bevestigd. Open de proefstart opnieuw in dezelfde browser.</p><a href="/">Proefstart</a>'); return;
    }
    if (state.ownerId && !session) { res.writeHead(401); res.end(); return; }
    if (url.pathname === "/begin") {
      const mode = input.action;
      if (!["owner", "reconnect", "calendar", "create", "candidate", "replace-client"].includes(mode) || (!state.ownerId && mode !== "owner")) throw Error("Invalid connection action.");
      if (mode === "replace-client" && clients.length !== 2) throw Error("Second OAuth client is not configured.");
      state.attempt = { id: randomBytes(24).toString("hex"), mode, sessionHash: session?.hash ?? null, client: mode === "replace-client" ? 1 : 0,
        email: settings.emails[mode === "candidate" ? 1 : 0], expires: Date.now()+15*60_000, scopes: scopesFor(mode) };
      observe("connection-started", { mode, activePresent: !!state.active });
      res.setHeader("Set-Cookie", `w2w-probe.attempt=${state.attempt.id}; Path=/; HttpOnly; SameSite=Lax`);
      redirect(res, `/api/auth/signin?callbackUrl=${encodeURIComponent(origin)}`); return;
    }
    if (!session || url.pathname !== "/action") throw Error("Owner session required.");
    if (input.action === "confirm") {
      const key = state.proposed; if (!key || !state.attempt?.completed) throw Error("No completed candidate connection.");
      if (state.attempt.mode === "candidate") state.candidate = key;
      else {
        if (state.attempt.mode === "replace-client") await readback();
        state.active = key;
      }
      delete state.proposed; observe("connection-confirmed", { mode: state.attempt.mode });
    } else if (input.action === "source" || input.action === "target") await createCalendar(input.action);
    else if (input.action === "readback") await readback();
    else if (input.action === "move") await moveEvent();
    else if (input.action === "cleanup") await cleanupTarget();
    else throw Error("Unknown probe action.");
    redirect(res, "/"); return;
  }
  if (url.pathname !== "/") { res.writeHead(404); res.end(); return; }
  const owner = !!session;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html lang="nl"><head><title>When2Watch Google-proef</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:17px system-ui;max-width:850px;margin:40px auto;padding:20px;background:#f3f8f5;color:#183835}button{font:inherit;padding:10px;margin:5px 0;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}</style></head><body><h1>When2Watch Google-proef</h1><p>Lokale proef op poort 3401. Alleen herkenbare proefagenda's en gemarkeerde proefitems worden gewijzigd.</p>
    ${url.searchParams.has("error") ? "<p>Google-koppeling niet afgerond. De actieve verbinding is behouden.</p>" : ""}
    ${url.searchParams.has("restart") ? "<p>Deze koppelpoging is verlopen of hoort bij een andere browser. Start de koppeling hier opnieuw en rond haar in dezelfde browser af.</p>" : ""}
    ${!state.ownerId ? `<p>Proefeigenaar: <strong>${escape(settings.emails[0])}</strong></p>${form("/begin", "Inloggen met proefeigenaar", "owner")}` : !owner ? "<p>De bestaande proefsessie ontbreekt. Herstel de oorspronkelijke browser; deze proef wordt niet opnieuw geclaimd.</p>" : `
    <p>Eigenaar ingelogd. Interne eigenaar behouden: ${state.observations.filter(item=>item.kind==="real-nextauth-callback" && item.sameInternalOwner).length} vervolgcallbacks.</p>
    ${form("/begin", "Eigenaar opnieuw verbinden", "reconnect")}${form("/begin", "Agenda lezen en events toestaan", "calendar")}${form("/begin", "Proefagenda aanmaken toestaan", "create")}${form("/begin", "Tweede proefaccount verbinden", "candidate")}${clients.length===2?form("/begin", "Nieuwe OAuth-client beproeven", "replace-client"):"<p>Tweede OAuth-client nog niet ingesteld.</p>"}
    ${state.proposed?form("/action", "Bevestig proefverbinding", "confirm"):""}${form("/action", "Maak proefbronagenda", "source")}${form("/action", "Maak proefdoelagenda", "target")}${form("/action", "Lees proefagenda's opnieuw", "readback")}${form("/action", "Beproef één toekomstig item verplaatsen", "move")}${form("/action", "Ruim bevestigd doelproefitem op", "cleanup")}
    <h2>Uitgevoerde controles</h2><pre>${escape(JSON.stringify(state.observations,null,2))}</pre>`}</body></html>`);
}
const server = createServer((req,res)=>{
  const work = lane.then(()=>handle(req,res)).catch(error=>{
    const code = error instanceof AppError ? error.code : "PROBE_ACTION_FAILED";
    observe("probe-action-error", {code});
    if (!res.headersSent) res.writeHead(500,{"Content-Type":"text/html; charset=utf-8"});
    res.end(`<p>De proefactie is niet afgerond (${escape(code)}). Een onzekere aanmaak wordt niet automatisch herhaald.</p><a href="/">Terug naar de proef</a>`);
  });
  lane=work.then(()=>{});
});
server.listen(3401,"127.0.0.1",()=>console.log("Google configuration probe ready: http://localhost:3401 (private SQLite; no production configuration)"));
for (const signal of ["SIGINT","SIGTERM"] as const) process.on(signal,()=>server.close(()=>void db.$disconnect().then(()=>process.exit(0))));
