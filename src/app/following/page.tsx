import { database } from "@/server/db";
import { config } from "@/server/config";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/user-access";
import { overview } from "@/server/overview";
import { Navigation } from "../navigation";
import { SeriesPanel } from "../series-panel";

export const dynamic = "force-dynamic";
export default async function Following() {
  const user = await currentUser(); if (!user) redirect("/");
  return <div className="following-page">
    <Navigation active="/following" admin={user.role === "ADMIN"} />
    <section className="hero compact"><p className="eyebrow">Your series, in your calendar</p><h1>Keep following your favorites.</h1><p className="intro">Search for a series and choose the right match. New episodes will appear in your calendar automatically.</p></section>
    <SeriesPanel data={await overview(user.id, database(), new Date(), config().origin)} />
  </div>;
}
