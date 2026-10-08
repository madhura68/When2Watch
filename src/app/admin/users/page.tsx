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
    <Navigation active="/admin/users" admin />
    <section className="hero compact"><p className="eyebrow">Admin</p><h1>Users and invitations.</h1>
      <p className="intro">You can see names, email addresses, and access status, but not other users' series or calendars.</p></section>
    <AdminUsersPanel currentUserId={user.id} users={users} invitations={invitations} />
  </>;
}
