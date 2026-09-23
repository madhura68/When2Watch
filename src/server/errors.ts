export class AppError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  // Provider exceptions can contain access tokens and request headers.
  console.error("when2watch: unexpected operation failure");
  return Response.json({ error: "Deze actie is niet gelukt. Probeer het opnieuw.", code: "UNEXPECTED" }, { status: 500 });
}
