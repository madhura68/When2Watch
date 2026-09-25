import { requireUser } from "@/server/user-access";
import { errorResponse } from "@/server/errors";
import { TVmaze } from "@/server/tvmaze";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try { await requireUser();return Response.json({shows:await new TVmaze().search(new URL(request.url).searchParams.get("q")??"")},{headers:{"Cache-Control":"private, no-store"}}); }
  catch(error) {return errorResponse(error);}
}
