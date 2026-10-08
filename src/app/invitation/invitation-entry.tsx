"use client";
import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export function InvitationEntry() {
  const token = useRef<string | null>(null);
  const [state, setState] = useState<"reading" | "ready" | "busy" | "invalid">("reading");
  useEffect(() => {
    // Read the fragment once and wipe it from the address bar and history; store it nowhere.
    const match = /(?:^#|&)token=([A-Za-z0-9_-]+)/.exec(window.location.hash);
    token.current = match?.[1] ?? null;
    window.history.replaceState(null, "", "/invitation");
    setState(token.current ? "ready" : "invalid");
  }, []);
  async function accept() {
    if (!token.current) return setState("invalid");
    setState("busy");
    const response = await fetch("/api/invitations/exchange", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token.current }) }).catch(() => null);
    token.current = null;
    if (!response?.ok) return setState("invalid");
    await signIn("google", { callbackUrl: "/settings" });
  }
  if (state === "invalid") return <p role="alert" className="notice error">This invitation is no longer valid. Ask the administrator for a new link.</p>;
  return <button className="primary" disabled={state !== "ready"} onClick={() => void accept()}>{state === "busy" ? "Please wait…" : "Accept invitation with Google"}</button>;
}
