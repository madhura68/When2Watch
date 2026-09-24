import { redirect } from "next/navigation";
import { signedInUser } from "@/server/auth";
import { config } from "@/server/config";
import { database } from "@/server/db";
import { publicInstallation } from "@/server/installation";
import { localDate, nextDate } from "@/lib/dates";
import { TrialPanel } from "./trial-panel";
import { Navigation } from "../navigation";
import { PreferencesPanel } from "./preferences-panel";
import { GooglePanel } from "./google-panel";
import { CalendarPanel } from "./calendar-panel";

export const dynamic = "force-dynamic";
export default async function Settings({ searchParams }: { searchParams: Promise<{ error?: string; connection?: string }> }) {
  const user = await signedInUser(); if (!user) redirect("/");
  const db = database();
  const [settings, calendar, probes, params] = await Promise.all([
    publicInstallation(db, user.id), db.calendarSettings.findUnique({ where: { userId: user.id } }),
    db.probe.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }), searchParams,
  ]);
  return <>
    <Navigation active="/settings" />
    <section className="hero compact"><p className="eyebrow">Instellingen</p><h1>Je agenda en voorkeuren.</h1><p className="intro">Pas je overzicht aan of controleer de Google-koppeling en je meldingen.</p></section>
    {(params.error || ["expired", "failed"].includes(params.connection ?? "")) && <p role="alert" className="notice error">De Google-koppeling is geannuleerd, geweigerd of verlopen. Je bestaande instellingen zijn behouden. Start de koppeling opnieuw als je wilt doorgaan.</p>}
    <PreferencesPanel preferences={settings.preferences} />
    <GooglePanel settings={settings} callbackUrl={`${config().origin}/api/auth/callback/google`} />
    <CalendarPanel settings={settings} />
    {calendar && <TrialPanel key={settings.preferences.timeZone} calendarId={calendar.calendarId} calendar={{ name: calendar.summary, timeZone: calendar.timeZone, confirmedAt: calendar.confirmedAt.toISOString(), reminders: calendar.defaultRemindersJson }} tomorrow={nextDate(localDate(new Date(), settings.preferences.timeZone))} probes={probes.map(probe => ({ id: probe.id, date: probe.date, status: probe.status, request: probe.requestJson, readback: probe.readbackJson }))} />}
  </>;
}
