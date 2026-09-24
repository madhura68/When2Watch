import { requireUser } from "@/server/auth";
import { config } from "@/server/config";
import { errorResponse } from "@/server/errors";
import { requireSameOrigin } from "@/server/http-guards";
import { syncService } from "@/server/services";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const user=await requireUser();requireSameOrigin(request,config().origin);
    const result=await syncService(user.id).sync(user.id,"manual");
    return Response.json(result,{status:result.status==="success"?200:502});
  }catch(error){return errorResponse(error);}
}
