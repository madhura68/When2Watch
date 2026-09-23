import { redirect } from "next/navigation";
import { signedInUser } from "@/server/auth";
import { config } from "@/server/config";
import { database } from "@/server/db";
import { localDate, nextDate } from "@/lib/dates";
import { AuthButton } from "../auth-buttons";
import { TrialPanel } from "./trial-panel";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await signedInUser();
  if (!user) redirect("/");
  const settings = config();
  const [calendar, probes, account] = await Promise.all([
    database().calendarSettings.findUnique({ where: { userId: user.id } }),
    database().probe.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    database().account.findFirst({ where: { userId: user.id, provider: "google" }, select: { needsReauth: true, refresh_token: true } }),
  ]);
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><AuthButton logout /></header>
    <section className="hero compact"><p className="eyebrow">Eerste proef · Slow Horses</p><h1>Komt jouw seintje aan?</h1><p className="intro">Eén proefitem, twee apps. We controleren een melding om 09:00 op de gekozen datum.</p></section>
    <section className="account-row"><div><strong>Google gekoppeld</strong><br /><span className="muted">{user.email}</span></div><span className="tag success">Ingelogd</span></section>
    {(account?.needsReauth || !account?.refresh_token) && <section className="notice error"><p>De blijvende toegang ontbreekt of is verlopen. Koppel Google opnieuw en geef beide agendatoestemmingen.</p><AuthButton /></section>}
    <TrialPanel calendarId={settings.calendarId} calendar={calendar ? { name: calendar.summary, timeZone: calendar.timeZone, confirmedAt: calendar.confirmedAt.toISOString(), reminders: calendar.defaultRemindersJson } : null} tomorrow={nextDate(localDate(new Date()))} probes={probes.map((probe) => ({ id: probe.id, date: probe.date, status: probe.status, request: probe.requestJson, readback: probe.readbackJson }))} />
  </>;
}
