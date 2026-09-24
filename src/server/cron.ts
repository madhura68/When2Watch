import { timingSafeEqual } from "node:crypto";
import { AppError, errorResponse } from "./errors";

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
