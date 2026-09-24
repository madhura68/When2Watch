import { redirect } from "next/navigation";
import { signedInUser } from "@/server/auth";
import { overview } from "@/server/overview";
import { Navigation } from "../navigation";
import { SeriesPanel } from "../series-panel";

export const dynamic = "force-dynamic";
export default async function Following() {
  const user = await signedInUser(); if (!user) redirect("/");
  return <div className="following-page">
    <Navigation active="/volgen" />
    <section className="hero compact"><p className="eyebrow">Je series, in je agenda</p><h1>Blijf je favorieten volgen.</h1><p className="intro">Zoek een serie en kies de juiste match. Nieuwe afleveringen komen vanzelf in je agenda.</p></section>
    <SeriesPanel data={await overview(user.id)} />
  </div>;
}
