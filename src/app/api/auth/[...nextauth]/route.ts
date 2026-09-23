import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/server/auth";
import { errorResponse } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  try {
    return await NextAuth(authOptions())(request, context);
  } catch (error) { return errorResponse(error); }
}

export { handler as GET, handler as POST };
