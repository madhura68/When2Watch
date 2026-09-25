import { requireUser } from "@/server/user-access";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { database } from "@/server/db";
import { overview } from "@/server/overview";
import { syncService } from "@/server/services";

export const runtime = "nodejs";
async function showInput(request: Request, requireTrying: boolean) {
  let body: unknown;
  try { body = await request.json(); }
  catch { throw new AppError("INVALID_INPUT",400,"De invoer is niet leesbaar. Probeer opnieuw."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("INVALID_INPUT",400,"De invoer is ongeldig.");
  const value = body as Record<string,unknown>;
  const id = typeof value.showId === "string" ? Number(value.showId) : NaN;
  if (Object.keys(value).some(key=>!["showId","trying"].includes(key)) || typeof value.showId !== "string" || value.showId.length > 200 || !/^\d+$/.test(value.showId) || !Number.isSafeInteger(id) || id <= 0 ||
      ((requireTrying || "trying" in value) && typeof value.trying !== "boolean")) {
    throw new AppError("INVALID_INPUT",400,"Kies een serie en een geldige voorkeur: Volgen of Proberen.");
  }
  return { id, trying: value.trying === true };
}
export async function GET() {
  try {const user=await requireUser();return Response.json(await overview(user.id),{headers:{"Cache-Control":"private, no-store"}});}catch(error){return errorResponse(error);}
}
export async function POST(request: Request) {
  try {
    const user=await requireUser();requireSameOrigin(request,config().origin);
    const {id,trying}=await showInput(request,false);
    const result=await syncService(user.id).add(user.id,id,trying);
    return Response.json(result,{status:result.status==="success"?200:502,headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
export async function PATCH(request: Request) {
  try {
    const user=await requireUser();requireSameOrigin(request,config().origin);
    const {id,trying}=await showInput(request,true);
    const result=await database().trackedShow.updateMany({where:{userId:user.id,tvmazeId:id},data:{trying}});
    if(result.count===0) throw new AppError("NOT_FOUND",404,"Deze serie staat niet in jouw overzicht.");
    return Response.json({showId:String(id),trying},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
