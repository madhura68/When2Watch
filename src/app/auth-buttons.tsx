"use client";
import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

export function AuthButton({ logout = false }: { logout?: boolean }) {
  const [busy, setBusy] = useState(false);
  return <button className={logout ? "secondary" : "primary"} disabled={busy} onClick={async () => {
    setBusy(true);
    try {
      if (logout) await signOut({ callbackUrl: "/" });
      else await signIn("google", { callbackUrl: "/" });
    } finally { setBusy(false); }
  }}>{busy ? "Even geduld…" : logout ? "Uitloggen" : "Koppel Google Agenda"}</button>;
}
