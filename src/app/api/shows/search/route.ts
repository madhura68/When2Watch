import { requireUser } from "@/server/user-access";
import { errorResponse } from "@/server/errors";
import { TVmaze } from "@/server/tvmaze";
import { database } from "@/server/db";
import { cachedSearch } from "@/server/search-cache";
import { MIN_SEARCH_LENGTH } from "@/lib/latest-search";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    await requireUser();
    const query=new URL(request.url).searchParams.get("q")??"";
    // Same four-character minimum as the UI; shorter queries never reach cache or source.
    const shows=query.trim().length<MIN_SEARCH_LENGTH?[]:await cachedSearch(database(),new TVmaze(),query);
    return Response.json({shows},{headers:{"Cache-Control":"private, no-store"}});
  }
  catch(error) {return errorResponse(error);}
}
