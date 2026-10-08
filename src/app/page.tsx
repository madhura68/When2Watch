import { config } from "@/server/config";
import { oauthReady } from "@/server/auth";
import { currentUser } from "@/server/user-access";
import { AuthButton } from "./auth-buttons";
import { redirect } from "next/navigation";
import { agendaOverview } from "@/server/agenda";
import { AgendaPanel } from "./agenda-panel";
import { Navigation } from "./navigation";

export const dynamic = "force-dynamic";
export async function generateMetadata() {
  const signedIn = !!await currentUser();
  return { robots: { index: !signedIn, follow: !signedIn } };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user=await currentUser();
  if (user) {
    const data = await agendaOverview(user.id, config().origin);
    if (!data.calendar && data.showCount === 0) redirect("/settings");
    return <>
      <Navigation active="/" admin={user.role === "ADMIN"} />
      <section className="hero compact"><p className="eyebrow">Coming up</p><h1>Your next episode.</h1><p className="intro">All known air dates for the series you follow, in one place.</p></section>
      <AgendaPanel data={data} />
    </>;
  }
  const { error } = await searchParams;
  return <>
    <header><a className="brand" href="/">When2Watch<span className="brand-dot">.</span></a><span className="tag">Your series, in your calendar</span></header>
    <section className="hero"><p className="eyebrow">Your series, in your calendar</p>
      <h1>A new episode.<br />A timely reminder.</h1>
      <p className="intro">When2Watch puts the original release date of every episode you follow into a Google Calendar of its own, so your phone reminds you the way you already set it up.</p>
    </section>
    <div className="steps-summary"><p><strong>Follow a series</strong><br />Find the shows you want to keep up with.</p><p><strong>It lands in your Google Calendar</strong><br />Use your calendar's notification settings.</p><p><strong>See where to watch</strong><br />Where to watch is coming soon.</p></div>
    <section className="card"><h2>Access is by invitation for now</h2>
      <p>When2Watch is free and currently invite-only. Have an invitation? Open the link you received.</p>
      {error && <p role="alert" className="notice error">Sign-in failed. Use the Google account you were invited with, then try again.</p>}
      {await oauthReady() ? <AuthButton /> : <p className="notice">The Google connection is being set up. Sign-in will be available when it is ready.</p>}
      <p className="muted small">Already have an account? Sign in with Google to open your agenda.</p>
    </section>
    <section className="card"><h2>Sources</h2><p>Episode data: <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">TVmaze (CC BY-SA)</a></p></section>
  </>;
}
