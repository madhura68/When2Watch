import { redirect } from "next/navigation";
import { currentUser } from "@/server/user-access";
import { config } from "@/server/config";
import { database } from "@/server/db";
import { userSettings } from "@/server/installation";
import { getActiveBinding } from "@/server/calendar-bindings";
import { localDate, nextDate } from "@/lib/dates";
import { TrialPanel } from "./trial-panel";
import { Navigation } from "../navigation";
import { PreferencesPanel } from "./preferences-panel";
import { GooglePanel } from "./google-panel";
import { CalendarPanel } from "./calendar-panel";

export const dynamic = "force-dynamic";
export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; connection?: string }> }) {
  const user = await currentUser(); if (!user) redirect("/");
  const db = database();
  const [settings, active, probes, params] = await Promise.all([
    userSettings(db, user.id), getActiveBinding(db, user.id),
    db.probe.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }), searchParams,
  ]);
  const calendar = "binding" in active ? active.binding : null;
  return <>
    <Navigation active="/settings" admin={user.role === "ADMIN"} />
    <section className="hero compact"><p className="eyebrow">Instellingen</p><h1>Je agenda en voorkeuren.</h1><p className="intro">Pas je overzicht aan of controleer de Google-koppeling en je meldingen.</p></section>
    {(params.error || ["expired", "failed"].includes(params.connection ?? "")) && <p role="alert" className="notice error">De Google-koppeling is geannuleerd, geweigerd of verlopen. Je bestaande instellingen zijn behouden. Start de koppeling opnieuw als je wilt doorgaan.</p>}
    <PreferencesPanel preferences={settings.preferences} />
    <GooglePanel settings={settings} callbackUrl={`${config().origin}/api/auth/callback/google`} />
    <CalendarPanel settings={settings} />
    {calendar && <TrialPanel key={settings.preferences.timeZone} calendarId={calendar.calendarId} calendar={{ name: calendar.summary ?? calendar.calendarId, timeZone: calendar.timeZone ?? settings.preferences.timeZone, confirmedAt: (calendar.confirmedAt ?? calendar.createdAt).toISOString(), reminders: calendar.defaultRemindersJson ?? "[]" }} tomorrow={nextDate(localDate(new Date(), settings.preferences.timeZone))} probes={probes.map(probe => ({ id: probe.id, date: probe.date, status: probe.status, request: probe.requestJson, readback: probe.readbackJson }))} />}
  </>;
}
