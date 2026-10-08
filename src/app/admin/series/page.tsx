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
    <Navigation active="/admin/series" admin />
    <section className="hero compact"><p className="eyebrow">Admin</p><h1>Series and followers.</h1>
      <p className="intro">For each series, the number of active users following or trying it. You cannot see who they are here.</p></section>
    <section className="card">
      {shows.length ? <table><thead><tr><th>Series</th><th>Followers</th></tr></thead>
        <tbody>{shows.map(show => <tr key={show.tvmazeId}><td>{show.title}</td><td>{show.followers}</td></tr>)}</tbody></table>
        : <p>No one follows a series yet.</p>}
    </section>
    <section className="card"><h2>TVmaze traffic</h2>
      <p>Since {new Date(tvmazeRequests.since).toLocaleString("en-GB", { timeZone: "Europe/Amsterdam", hourCycle: "h23" })}: {tvmazeRequests.total} requests
        (search {tvmazeRequests.search}, series {tvmazeRequests.show}, updates {tvmazeRequests.updates}{tvmazeRequests.other ? `, other ${tvmazeRequests.other}` : ""}). Google traffic is not included here.</p>
    </section>
  </>;
}
