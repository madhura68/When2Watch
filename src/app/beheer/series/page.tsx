import { redirect } from "next/navigation";
import { database } from "@/server/db";
import { adminStats } from "@/server/admin-stats";
import { currentUser } from "@/server/user-access";
import { Navigation } from "../../navigation";

export const dynamic = "force-dynamic";
export default async function AdminSeries() {
  const user = await currentUser(); if (!user) redirect("/");
  if (user.role !== "ADMIN") redirect("/");
  const { shows, tvmazeRequests } = await adminStats(database(), user.id);
  return <>
    <Navigation active="/beheer/series" admin />
    <section className="hero compact"><p className="eyebrow">Beheer</p><h1>Series en volgers.</h1>
      <p className="intro">Per serie het aantal actieve gebruikers dat haar volgt of probeert. Wie dat zijn, zie je hier niet.</p></section>
    <section className="card">
      {shows.length ? <table><thead><tr><th>Serie</th><th>Volgers</th></tr></thead>
        <tbody>{shows.map(show => <tr key={show.tvmazeId}><td>{show.title}</td><td>{show.followers}</td></tr>)}</tbody></table>
        : <p>Nog niemand volgt een serie.</p>}
    </section>
    <section className="card"><h2>TVmaze-verkeer</h2>
      <p>Sinds {new Date(tvmazeRequests.since).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}: {tvmazeRequests.total} aanvragen
        (zoeken {tvmazeRequests.search}, serie {tvmazeRequests.show}, updates {tvmazeRequests.updates}{tvmazeRequests.other ? `, overig ${tvmazeRequests.other}` : ""}). Google-verkeer telt hier niet mee.</p>
    </section>
  </>;
}
