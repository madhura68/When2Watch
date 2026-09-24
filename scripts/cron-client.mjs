// Runs inside the app container. The credential never enters argv or output.
try {
  if (!process.env.CRON_SECRET) throw new Error("missing configuration");
  const response = await fetch("http://127.0.0.1:3000/api/cron/sync", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(600_000),
  });
  const body = await response.json();
  console.log(JSON.stringify({ at: new Date().toISOString(), httpStatus: response.status, ...body }));
  process.exitCode = response.ok && body.status === "success" ? 0 : 1;
} catch {
  console.error(JSON.stringify({ at: new Date().toISOString(), status: "failed", error: "Cron kon When2Watch niet bereiken of configuratie ontbreekt." }));
  process.exitCode = 1;
}
