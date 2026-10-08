"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  calendarId: string;
  calendar: { name: string; timeZone: string; confirmedAt: string; reminders: string } | null;
  tomorrow: string;
  eventMode: "ALL_DAY" | "FIXED_TIME";
  eventTime: string | null;
  probes: { id: string; date: string; status: string; request: string; readback: string | null }[];
};

export function TrialPanel({ calendarId, calendar, tomorrow, probes, eventMode, eventTime }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(tomorrow);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function action(path: string, method: string, payload: object, success: string) {
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const result = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const response = await result.json();
      if (!result.ok) throw new Error(response.error ?? "This action failed.");
      setMessage(success);
      router.refresh();
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Connection interrupted. Try the same action again."); }
    finally { setBusy(false); }
  }
  const createLabel = eventMode === "FIXED_TIME" ? `Create fixed-time probe at ${eventTime}` : "Create all-day probe";
  const probeStyle = (raw: string) => {
    const request = JSON.parse(raw);
    return request.start?.dateTime ? `Fixed time ${new Intl.DateTimeFormat("en-GB", {timeZone: request.start.timeZone, hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).format(new Date(request.start.dateTime))}` : "All-day";
  };
  const reminders = calendar ? JSON.parse(calendar.reminders) as {method: string; minutes: number}[] : [];
  return <>
    <div aria-live="polite" aria-atomic="true">{message && <p className={`notice ${failed ? "error" : "success"}`}>{message}</p>}</div>
    <section className="card">
      <h2>Check your calendar</h2>
      <p>Your selected calendar is <strong>{calendar?.name}</strong>. Check access before creating the test event.</p>
      <details><summary>View calendar ID</summary><code className="calendar-id">{calendarId}</code></details>
      {calendar && <p className="notice success">Confirmed through Google: <strong>{calendar.name}</strong> · {calendar.timeZone} · writable</p>}
      <p className="muted small">Default event notifications: {reminders.length ? reminders.map(r => `${r.method}: ${r.minutes} minutes before`).join(", ") : "None"}</p>
      {calendar && reminders.length === 0 && <p className="notice">No default notification for timed events is set on this calendar; set one in Google Calendar before the probe.</p>}
      <button disabled={busy} onClick={() => action("/api/calendar/verify", "POST", {}, "The selected calendar was read back and confirmed.")}>{busy ? "Please wait…" : calendar ? "Check calendar again" : "Check and confirm this calendar"}</button>
    </section>
    <section className="card">
      <h2>Test a notification</h2>
      <p>The probe uses your selected event style and the calendar's default notifications. Delivery also depends on your device settings.</p>
      <ol className="checklist">
        <li>In Google Calendar, set default notifications for timed and all-day events before creating a probe.</li>
        <li>Make sure your selected calendar is visible and notifications are allowed for your calendar app.</li>
        <li>If you use Google Calendar in your browser, leave it open. Also check any Focus or Do Not Disturb settings.</li>
      </ol>
      <form onSubmit={(event) => { event.preventDefault(); void action("/api/probe", "POST", { date }, "The test event was created and read back. Check that it arrives in every calendar app you use."); }}>
        <label htmlFor="probe-date">Notification test date</label>
        <div className="form-row"><input id="probe-date" type="date" min={tomorrow} value={date} onChange={(event) => setDate(event.target.value)} required disabled={busy} /><button className="primary" disabled={busy || !calendar}>{busy ? "Please wait…" : createLabel}</button></div>
      </form>
      {!calendar && <p className="muted small">Confirm the calendar above first.</p>}
      <p className="muted small">This is a recognizable test event, not a real episode. A created event does not prove that your device displayed the notification.</p>
    </section>
    {probes.map((probe) => <section className="card" key={probe.id}>
      <span className="tag">{probe.status === "created" ? "Read back from Google" : probe.status === "deleted" ? "Cleaned up" : "Request not confirmed yet"}</span>
      <h2>Probe on {probe.date}</h2>
      <p>{probeStyle(probe.request)}</p>
      {probe.readback && JSON.parse(probe.readback).location && <p>Location: {JSON.parse(probe.readback).location}</p>}
      <p>The notification time follows your calendar app settings. Verify actual delivery on every device you use.</p>
      {probe.status === "prepared" && <button disabled={busy} onClick={() => action("/api/probe", "POST", { date: probe.date }, "The existing test event was found and confirmed.")}>Resume the same request</button>}
      <details><summary>View request and response</summary><p className="small">This data proves the calendar event exists. It does not prove that a notification was received.</p><pre>{JSON.stringify({ request: JSON.parse(probe.request), readback: probe.readback ? JSON.parse(probe.readback) : null }, null, 2)}</pre></details>
      {probe.status !== "deleted" && <button className="secondary" disabled={busy} onClick={() => action("/api/probe", "DELETE", { id: probe.id }, "Only this test event was cleaned up.")}>Clean up this test event</button>}
    </section>)}
  </>;
}
