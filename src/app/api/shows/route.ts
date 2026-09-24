import { requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { AppError, errorResponse } from "@/server/errors";
import { requireSameOrigin, stringField } from "@/server/http-guards";
import { overview } from "@/server/overview";
import { syncService } from "@/server/services";

export const runtime = "nodejs";
export async function GET() {
  try {const user=await requireUser();return Response.json(await overview(user.id));}catch(error){return errorResponse(error);}
}
export async function POST(request: Request) {
  try {
    const user=await requireUser();requireSameOrigin(request,config().origin);
    const value=await stringField(request,"showId"),id=Number(value);
    if(!/^\d+$/.test(value)||!Number.isSafeInteger(id)||id<=0) throw new AppError("INVALID_INPUT",400,"Kies een serie uit de zoekresultaten.");
    const result=await syncService(user.id).add(user.id,id);
    return Response.json(result,{status:result.status==="success"?200:502});
  }catch(error){return errorResponse(error);}
}
