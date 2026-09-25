/**
 * IDEA-219 P1 operator probe: can When2Watch work with only
 * calendar.calendarlist.readonly + calendar.app.created?
 * Never runs in the app or CI. Mutates only calendars it created itself and records.
 * Run: W2W_LIMITED_PROBE_CONFIG=/abs/private/config.json npx tsx scripts/prove-limited-calendar.ts --authorized-limited-calendar-probe
 */
import { createServer } from "node:http";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

const identityScopes = ["openid", "email", "profile"];
const listScope = "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const createdScope = "https://www.googleapis.com/auth/calendar.app.created";
export const limitedScopes = [...identityScopes, listScope, createdScope];
const identityGrants = new Set(["openid", "email", "profile", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]);

export type ProbeConfig = { accounts: string[]; credentials: string; calendarPrefix: string; existingCalendarId?: string };

export function parseProbeConfig(raw: unknown): ProbeConfig {
  const value = raw as Partial<ProbeConfig> & { probeClientIsNotProduction?: unknown };
  if (!Array.isArray(value?.accounts) || value.accounts.length < 1 || value.accounts.some(email => typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email))) {
    throw Error("Supply an explicit allowlist of probe account email addresses.");
  }
  if (typeof value.credentials !== "string" || !isAbsolute(value.credentials)) throw Error("The probe OAuth client credentials path must be absolute.");
  if (value.probeClientIsNotProduction !== true) throw Error("Use a separate probe OAuth client; production grants may not be touched or revoked.");
  if (typeof value.calendarPrefix !== "string" || value.calendarPrefix.trim().length < 8) throw Error("A recognisable calendar name prefix of at least 8 characters is required.");
  if (value.existingCalendarId !== undefined && typeof value.existingCalendarId !== "string") throw Error("existingCalendarId must be a string.");
  return { accounts: value.accounts.map(email => email.trim().toLowerCase()), credentials: value.credentials, calendarPrefix: value.calendarPrefix.trim(), existingCalendarId: value.existingCalendarId };
}

/** Narrowness is judged on what Google actually granted (token/tokeninfo scope), never on the request. */
export function grantStatus(granted: string | undefined) {
  const scopes = new Set((granted ?? "").split(/\s+/).filter(Boolean));
  const missing = [listScope, createdScope].filter(scope => !scopes.has(scope));
  const broader = [...scopes].filter(scope => !identityGrants.has(scope) && scope !== listScope && scope !== createdScope).sort();
  return { narrow: missing.length === 0 && broader.length === 0, missing, broader };
}

type ProbeCalendar = { id?: string; name: string; phase: "sending" | "ready" | "uncertain"; nonce?: string; step?: string; beforeIds?: string[] };
export function assertProbeCalendar(state: { calendars: ProbeCalendar[] }, calendarId: string, prefix: string) {
  const calendar = state.calendars.find(item => item.id === calendarId && item.phase === "ready");
  if (!calendar) throw Error("Refusing mutation: calendar was not created by this probe.");
  if (!calendar.name.startsWith(prefix)) throw Error("Refusing mutation: calendar name lacks the probe prefix.");
  return calendar;
}

type ListedCalendar = { id: string; summary?: string; description?: string };
/** After a lost POST /calendars response: adopt only a calendar that is new since the snapshot AND carries the nonce. */
export function reconcileLostCalendarCreate(pending: { name: string; nonce: string }, beforeIds: string[], after: ListedCalendar[]) {
  const before = new Set(beforeIds);
  const ids = after.filter(item => !before.has(item.id) && item.summary === pending.name && item.description?.includes(`nonce ${pending.nonce}`)).map(item => item.id);
  if (ids.length === 1) return { status: "adopted" as const, id: ids[0] };
  if (ids.length > 1) return { status: "ambiguous" as const, ids };
  return { status: "uncertain" as const };
}

const keepValues = new Set(["kind", "accessRole", "status", "date", "timeZone", "method", "minutes", "useDefault", "transparency", "token_type", "expires_in", "scope", "code", "reason", "domain", "primary", "deleted", "hidden", "selected"]);
const secretKeys = /token|secret|code_verifier|authorization|password/i;
/** Evidence keeps structure, booleans, numbers and known enum fields; all other strings become "<string>". */
export function sanitizeShape(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return value.map(item => sanitizeShape(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, sanitizeShape(item, name)]));
  if (typeof value !== "string") return value;
  if (secretKeys.test(key) && key !== "token_type") return "<redacted>";
  if (key === "scope") return value;
  return keepValues.has(key) ? value : "<string>";
}

/** A create whose POST was sent is never sent again: prove it from the list snapshot or stay uncertain. */
export function resumeSentCreate(entry: { name: string; nonce?: string; beforeIds?: string[] }, after: ListedCalendar[]) {
  if (!entry.beforeIds || !entry.nonce) throw Error("No pre-POST list snapshot recorded; resolve this sent create manually.");
  return reconcileLostCalendarCreate({ name: entry.name, nonce: entry.nonce }, entry.beforeIds, after);
}

/** Pagination is only proven when a list of several calendars was actually read page by page. */
export const paginationProven = (pages: number, count: number) => count >= 2 && pages >= 2;

export const requiredSteps = ["authorize", "grant-narrow", "list-paginated", "calendar-created", "event-crud", "calendar-renamed", "token-refresh", "lost-create-reconciled", "legacy-readonly-checked"];
export function probeOutcome(results: { step: string; ok: boolean; cause?: string }[]) {
  // A retried step is judged on its latest attempt; earlier failures stay in the history.
  const latest = [...new Map(results.map(result => [result.step, result])).values()];
  const failed = latest.find(result => !result.ok);
  if (failed) return { status: "FAILED" as const, cause: `${failed.step}: ${failed.cause ?? "unknown"}` };
  const missing = requiredSteps.find(step => !latest.some(result => result.step === step));
  return missing ? { status: "BLOCKED" as const, cause: `not executed: ${missing}` } : { status: "PASSED" as const };
}

// ---------------------------------------------------------------- operator run
const origin = "http://localhost:3401", callbackPath = "/api/auth/callback/google";
type Tokens = { access_token: string; refresh_token?: string; scope?: string; expires_in?: number; id_token?: string };
type State = {
  flow?: { state: string; verifier: string; includeGranted: boolean }; tokens?: Tokens; email?: string;
  calendars: ProbeCalendar[]; results: { step: string; ok: boolean; cause?: string; at: string; detail?: unknown }[];
};

async function main() {
  if (!process.argv.includes("--authorized-limited-calendar-probe")) throw Error("Explicit --authorized-limited-calendar-probe is required.");
  const configPath = process.env.W2W_LIMITED_PROBE_CONFIG;
  if (!configPath || !isAbsolute(configPath)) throw Error("Set W2W_LIMITED_PROBE_CONFIG to an absolute private JSON path.");
  if ((statSync(configPath).mode & 0o077) !== 0) throw Error("The private probe configuration must have mode 0600.");
  process.umask(0o077);
  const config = parseProbeConfig(JSON.parse(readFileSync(configPath, "utf8")));
  const client = JSON.parse(readFileSync(config.credentials, "utf8")).web as { client_id?: string; client_secret?: string };
  if (!client?.client_id || !client.client_secret) throw Error("A web OAuth client is required.");
  const dir = join(dirname(configPath), "limited-calendar-state");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const statePath = join(dir, "state.json"), evidencePath = join(dir, "evidence.json");
  const state: State = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { calendars: [], results: [] };
  const save = () => { writeFileSync(`${statePath}.tmp`, JSON.stringify(state), { mode: 0o600 }); renameSync(`${statePath}.tmp`, statePath); };
  const shapes: Record<string, unknown> = existsSync(evidencePath) ? JSON.parse(readFileSync(evidencePath, "utf8")).shapes ?? {} : {};
  const record = (step: string, ok: boolean, cause?: string, detail?: unknown) => {
    state.results.push({ step, ok, cause, detail, at: new Date().toISOString() }); save();
    writeFileSync(evidencePath, JSON.stringify({ outcome: probeOutcome(state.results), results: state.results, shapes }, null, 2), { mode: 0o600 });
    console.log(`${ok ? "ok  " : "FAIL"} ${step}${cause ? ` — ${cause}` : ""}`);
  };

  async function token(form: Record<string, string>): Promise<Tokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: client.client_id!, client_secret: client.client_secret!, ...form }) });
    const body = await response.json() as Tokens & { error?: string };
    if (!response.ok) throw Error(`token endpoint ${response.status} ${body.error ?? ""}`.trim());
    shapes[`token-${form.grant_type}`] = sanitizeShape(body);
    return body;
  }
  async function api(path: string, init: RequestInit = {}, label?: string) {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${state.tokens!.access_token}` } });
    const body = response.status === 204 ? null : await response.json().catch(() => null);
    if (label) shapes[label] = { status: response.status, body: sanitizeShape(body) };
    return { status: response.status, body: body as Record<string, unknown> | null };
  }
  async function listAll(label: string, pageSize = "1") {
    const items: ListedCalendar[] = []; let pageToken: string | undefined, pages = 0;
    do {
      const query = new URLSearchParams({ maxResults: pageSize }); if (pageToken) query.set("pageToken", pageToken);
      const { status, body } = await api(`users/me/calendarList?${query}`, {}, pages === 0 ? `${label}-page1` : undefined);
      if (status !== 200) throw Error(`calendarList ${status}`);
      items.push(...((body?.items as ListedCalendar[]) ?? [])); pageToken = body?.nextPageToken as string | undefined; pages++;
    } while (pageToken && pages < 500);
    return { items, pages };
  }
  /** POST /calendars exactly once per step; on resume a sent create is reconciled, never repeated. */
  async function createOnce(step: string, name: string, discardResponse: boolean) {
    const sent = state.calendars.find(item => item.step === step);
    if (sent?.phase === "ready") return sent;
    if (sent) {
      const outcome = resumeSentCreate(sent, (await listAll(`${step}-resume`, "250")).items);
      if (outcome.status !== "adopted") { sent.phase = "uncertain"; save(); throw Error(`sent create not provable: ${outcome.status}; not re-sending`); }
      sent.id = outcome.id; sent.phase = "ready"; save(); return sent;
    }
    const beforeIds = (await listAll(`${step}-before`, "250")).items.map(item => item.id), nonce = randomUUID();
    const entry: ProbeCalendar = { name, phase: "sending", nonce, step, beforeIds }; state.calendars.push(entry); save();
    const response = await api("calendars", { method: "POST", body: JSON.stringify({ summary: name, description: `When2Watch P1-proef nonce ${nonce}`, timeZone: "Europe/Amsterdam" }) }, discardResponse ? undefined : "calendar-create").catch(() => null);
    if (!discardResponse && response?.status === 200 && typeof response.body?.id === "string") { entry.id = response.body.id; entry.phase = "ready"; save(); return entry; }
    // Lost or discarded response: Google may have written. Prove it from the list; never POST again.
    const outcome = resumeSentCreate(entry, (await listAll(`${step}-after`, "250")).items);
    if (outcome.status !== "adopted") { entry.phase = "uncertain"; save(); throw Error(`create not provable: ${outcome.status}`); }
    entry.id = outcome.id; entry.phase = "ready"; save(); return entry;
  }
  const redo = new Set((process.argv.find(arg => arg.startsWith("--redo="))?.slice(7) ?? "").split(",").filter(Boolean));
  const step = async (name: string, run: () => Promise<unknown>) => {
    if (!redo.has(name) && state.results.some(result => result.step === name && result.ok)) return;
    try { record(name, true, undefined, await run()); } catch (error) { record(name, false, (error as Error).message); throw error; }
  };

  async function runProbe() {
    await step("grant-narrow", async () => {
      const info = await fetch("https://oauth2.googleapis.com/tokeninfo", { method: "POST", body: new URLSearchParams({ access_token: state.tokens!.access_token }) }).then(r => r.json()) as { scope?: string };
      const status = grantStatus(info.scope);
      if (!status.narrow) throw Error(`effective grant not narrow: missing=${status.missing.join(",") || "-"} broader=${status.broader.join(",") || "-"}; revoke the probe client grant and re-authorize`);
      return { ...status, includeGrantedScopes: state.flow?.includeGranted };
    });
    await step("calendar-created", async () => {
      const entry = await createOnce("calendar-created", `${config.calendarPrefix} ${new Date().toISOString().slice(0, 10)} vrije naam`, false);
      const listed = (await listAll("after-create", "250")).items.some(item => item.id === entry.id);
      if (!listed) throw Error("created calendar missing from calendarList");
      return { listed };
    });
    const calendarId = state.calendars.find(item => item.step === "calendar-created" && item.phase === "ready")!.id!;
    await step("event-crud", async () => {
      assertProbeCalendar(state, calendarId, config.calendarPrefix);
      const id = createHash("sha256").update(`${calendarId}:p1`).digest("hex").slice(0, 32).replace(/[^a-v0-9]/g, "a");
      const base = `calendars/${encodeURIComponent(calendarId)}/events`;
      const created = await api(`${base}?sendUpdates=none`, { method: "POST", body: JSON.stringify({ id, summary: "[PROEF When2Watch] P1", start: { date: "2026-10-01" }, end: { date: "2026-10-02" }, extendedProperties: { private: { app: "when2watch", kind: "probe" } } }) }, "event-insert");
      if (created.status !== 200) throw Error(`insert ${created.status}`);
      const read = await api(`${base}/${id}`, {}, "event-get"); if (read.status !== 200) throw Error(`get ${read.status}`);
      const patched = await api(`${base}/${id}?sendUpdates=none`, { method: "PATCH", headers: { "If-Match": String(read.body!.etag) }, body: JSON.stringify({ summary: "[PROEF When2Watch] P1 gewijzigd" }) }, "event-patch");
      if (patched.status !== 200) throw Error(`patch ${patched.status}`);
      const duplicate = await api(`${base}?sendUpdates=none`, { method: "POST", body: JSON.stringify({ id, summary: "dup", start: { date: "2026-10-01" }, end: { date: "2026-10-02" } }) }, "event-insert-duplicate");
      const removed = await api(`${base}/${id}?sendUpdates=none`, { method: "DELETE", headers: { "If-Match": String(patched.body!.etag) } }, "event-delete");
      if (removed.status !== 204) throw Error(`delete ${removed.status}`);
      const after = await api(`${base}/${id}`, {}, "event-after-delete");
      return { duplicateInsertStatus: duplicate.status, afterDelete: after.status === 200 ? after.body?.status : after.status };
    });
    await step("calendar-renamed", async () => {
      assertProbeCalendar(state, calendarId, config.calendarPrefix);
      const name = `${config.calendarPrefix} hernoemd`;
      const { status } = await api(`calendars/${encodeURIComponent(calendarId)}`, { method: "PATCH", body: JSON.stringify({ summary: name }) }, "calendar-rename");
      if (status !== 200) throw Error(`rename ${status}`);
      const read = await api(`users/me/calendarList/${encodeURIComponent(calendarId)}`, {}, "calendar-after-rename");
      if (read.body?.summary !== name) throw Error("rename not visible in readback");
      state.calendars.find(item => item.id === calendarId)!.name = name; save();
      return { sameId: read.body?.id === calendarId };
    });
    await step("token-refresh", async () => {
      if (!state.tokens?.refresh_token) throw Error("no refresh token issued");
      const refreshed = await token({ grant_type: "refresh_token", refresh_token: state.tokens.refresh_token });
      state.tokens = { ...state.tokens, access_token: refreshed.access_token, scope: refreshed.scope }; save();
      const { status } = await api(`users/me/calendarList/${encodeURIComponent(calendarId)}`);
      return { readAfterRefresh: status, refreshedGrant: grantStatus(refreshed.scope) };
    });
    await step("lost-create-reconciled", async () => {
      // Response deliberately discarded: simulates a timeout after Google may have written.
      await createOnce("lost-create-reconciled", `${config.calendarPrefix} onzeker`, true);
      return { outcome: "adopted", postsSent: 1 };
    });
    // After both creates the account holds several calendars, so page size 1 forces real pagination.
    await step("list-paginated", async () => { const { items, pages } = await listAll("calendar-list"); if (!paginationProven(pages, items.length)) throw Error(`pagination not exercised (${items.length} calendar(s), ${pages} page(s)); rerun after calendar-created`); return { pages, count: items.length }; });
    await step("legacy-readonly-checked", async () => {
      if (!config.existingCalendarId) throw Error("configure existingCalendarId (read-only check of a non-app calendar)");
      const entry = await api(`users/me/calendarList/${encodeURIComponent(config.existingCalendarId)}`, {}, "legacy-calendarlist");
      const events = await api(`calendars/${encodeURIComponent(config.existingCalendarId)}/events?maxResults=1`, {}, "legacy-events-read");
      return { calendarListStatus: entry.status, eventsReadStatus: events.status, eventsReadableWithLimitedScopes: events.status === 200 };
    });
    console.log(JSON.stringify(probeOutcome(state.results)));
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    try {
      if (url.pathname === "/start") {
        const includeGranted = url.searchParams.get("include") === "true";
        state.flow = { state: randomBytes(24).toString("hex"), verifier: randomBytes(48).toString("base64url"), includeGranted }; save();
        const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        Object.entries({ client_id: client.client_id!, redirect_uri: origin + callbackPath, response_type: "code", scope: limitedScopes.join(" "), access_type: "offline",
          prompt: "consent select_account", include_granted_scopes: String(includeGranted), state: state.flow.state, code_challenge_method: "S256",
          code_challenge: createHash("sha256").update(state.flow.verifier).digest("base64url"), login_hint: config.accounts[0] }).forEach(([k, v]) => auth.searchParams.set(k, v));
        res.writeHead(302, { Location: auth.toString(), "Referrer-Policy": "no-referrer" }).end(); return;
      }
      if (url.pathname === callbackPath) {
        const flow = state.flow; delete state.flow; save();
        if (!flow || url.searchParams.get("state") !== flow.state) throw Error("state mismatch");
        if (url.searchParams.get("error")) throw Error(`consent ${url.searchParams.get("error")}`);
        const tokens = await token({ grant_type: "authorization_code", code: url.searchParams.get("code") ?? "", code_verifier: flow.verifier, redirect_uri: origin + callbackPath });
        const claims = JSON.parse(Buffer.from((tokens.id_token ?? "..").split(".")[1], "base64url").toString() || "{}") as { email?: string; email_verified?: boolean };
        if (!claims.email_verified) throw Error("account email not verified by Google");
        if (!config.accounts.includes((claims.email ?? "").toLowerCase())) throw Error("account not on the probe allowlist (check the chosen Google account)");
        const granted = grantStatus(tokens.scope);
        if (granted.missing.length) throw Error(`Calendar scopes not granted: ${granted.missing.map(scope => scope.split("/").pop()).join(", ")}; tick both Calendar boxes on the consent screen`);
        state.tokens = tokens; state.email = claims.email!.toLowerCase(); state.flow = { ...flow, state: "used" }; save();
        record("authorize", true, undefined, { includeGrantedScopes: flow.includeGranted, grant: grantStatus(tokens.scope) });
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Toestemming ontvangen. De proef loopt in de terminal.");
        await runProbe().catch(() => undefined); server.close(); return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<h1>When2Watch P1 — beperkte agendarechten</h1>
        <p>Alleen proefaccount(s) uit de allowlist. <a href="/start">Autoriseer (include_granted_scopes=false)</a> ·
        <a href="/start?include=true">Autoriseer met include_granted_scopes=true</a></p>`);
    } catch (error) { record("authorize", false, (error as Error).message); res.writeHead(400).end("Proef geweigerd; zie terminal."); }
  });
  if (state.tokens && process.argv.includes("--resume")) {
    // Access tokens live one hour; refresh from the stored refresh token before resuming.
    if (state.tokens.refresh_token) {
      const refreshed = await token({ grant_type: "refresh_token", refresh_token: state.tokens.refresh_token });
      state.tokens = { ...state.tokens, access_token: refreshed.access_token, scope: refreshed.scope }; save();
    }
    await runProbe(); return;
  }
  server.listen(3401, "127.0.0.1", () => console.log(`Open ${origin}/ in de browser (proefaccount).`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
