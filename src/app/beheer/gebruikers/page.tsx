import { redirect } from "next/navigation";
import { database } from "@/server/db";
import { listUsers } from "@/server/admin-users";
import { listInvitations } from "@/server/invitations";
import { currentUser } from "@/server/user-access";
import { Navigation } from "../../navigation";
import { AdminUsersPanel } from "./admin-users-panel";

export const dynamic = "force-dynamic";
export default async function AdminUsers() {
  const user = await currentUser(); if (!user) redirect("/");
  if (user.role !== "ADMIN") redirect("/");
  const db = database();
  const [users, invitations] = await Promise.all([listUsers(db, user.id), listInvitations(db, user.id)]);
  return <>
    <Navigation active="/beheer/gebruikers" admin />
    <section className="hero compact"><p className="eyebrow">Beheer</p><h1>Gebruikers en uitnodigingen.</h1>
      <p className="intro">Je ziet naam, e-mailadres en toegang; geen series of agenda's van anderen.</p></section>
    <AdminUsersPanel currentUserId={user.id} users={users} invitations={invitations} />
  </>;
}
