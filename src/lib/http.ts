import { ZodError } from "zod";
import { LedgerAuthError } from "./ledger";

/** Map known errors to responses without leaking internals. */
export function errorResponse(err: unknown): Response {
  if (err instanceof LedgerAuthError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return Response.json({ error: "invalid request", issues: err.issues }, { status: 400 });
  }
  // A missing setting is the deployer's to fix, and the name is not a secret: say which one.
  if (err instanceof Error && err.message.startsWith("Missing required environment variable")) {
    console.error(err);
    return Response.json({ error: `${err.message}. Add it in the hosting settings and redeploy.` }, { status: 503 });
  }
  console.error(err);
  return Response.json({ error: "internal error" }, { status: 500 });
}

/** Unparseable bodies become `undefined`, which schema validation rejects with a 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
