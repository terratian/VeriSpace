/** Turn a Supabase/PostgREST error into something a manager can act on. */
export function describeDbError(error: { code?: string; message: string }): string {
  if (error.code === "42703" || error.code === "42P01" || /(column|relation) .* does not exist/i.test(error.message)) {
    return "The database is missing the latest migration. Apply the newest files in supabase/migrations (Supabase, SQL Editor), then try again.";
  }
  if (error.code === "42501") return "You don't have permission to do that.";
  return error.message;
}
