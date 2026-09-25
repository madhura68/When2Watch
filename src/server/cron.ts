import { timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AppError, errorResponse } from "./errors";
import { refreshFollowedCatalog, type CatalogSource } from "./catalog";
import type { SyncService } from "./sync";
import { runRetention } from "./retention";

export async function cronResponse(request: Request, secret: string | undefined, run: () => Promise<{status: string}>): Promise<Response> {
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual,expected)) {
    return Response.json({ error: "Ongeldige cron-toegang.", code: "UNAUTHORIZED" },{ status: 401 });
  }
  try { const result = await run(); return Response.json(result,{status: result.status === "success" ? 200 : 502}); }
  catch (error) {
    if (error instanceof AppError && error.code === "SYNC_BUSY") return Response.json({status:"busy",error:error.message},{status:409});
    return errorResponse(error);
  }
}

export type ScheduledReport = { status: "success" | "partial" | "failed"; users: number; succeeded: number; partial: number; failed: number; busy: number;
  catalog: { index: string; checked: number; fetched: number; failed: number } };

/**
 * One catalog refresh for everyone, then each ACTIVE follower in turn. A failure or busy lock for one user
 * never stops the next. The report holds counts only, no personal payloads.
 */
export async function runScheduledSync(db: PrismaClient, source: CatalogSource, syncFor: (userId: string) => SyncService, now = new Date()): Promise<ScheduledReport> {
  const catalog = await refreshFollowedCatalog(db, source, now);
  const users = await db.user.findMany({ where: { accessStatus: "ACTIVE", OR: [{ follows: { some: {} } }, { eventLinks: { some: { status: { not: "deleted" } } } }] }, select: { id: true }, orderBy: { id: "asc" } });
  const report: ScheduledReport = { status: "success", users: users.length, succeeded: 0, partial: 0, failed: 0, busy: 0,
    catalog: { index: catalog.index, checked: catalog.checked, fetched: catalog.fetched, failed: catalog.failed } };
  for (const { id } of users) {
    try {
      const result = await syncFor(id).sync(id, "cron", { refresh: false });
      if (result.status === "success") report.succeeded++; else if (result.status === "partial") report.partial++; else report.failed++;
    } catch (error) {
      if (error instanceof AppError && error.code === "SYNC_BUSY") report.busy++; else report.failed++;
    }
  }
  const problems = report.partial + report.failed + report.busy + catalog.failed + (catalog.index === "failed" ? 1 : 0);
  report.status = !problems ? "success" : report.succeeded + report.partial > 0 ? "partial" : "failed";
  return report;
}

/** The daily scheduler run: sync first, then retention. A retention failure makes the run partial, never hides the sync result. */
export async function runDaily(db: PrismaClient, source: CatalogSource, syncFor: (userId: string) => SyncService, now = new Date()) {
  const report = await runScheduledSync(db, source, syncFor, now);
  try { return { ...report, retention: await runRetention(db, now) }; }
  catch { return { ...report, status: report.status === "success" ? "partial" as const : report.status, retention: "failed" as const }; }
}
