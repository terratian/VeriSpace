/**
 * Links are no longer handed out as URLs. Guests get theirs by text to the phone on the booking, and crew by
 * text to their own phone, with email as the fallback, all sent from the dashboard. This route stays so old
 * callers get a clear answer.
 */
export async function POST() {
  return Response.json({ error: "Links are sent by text or email from the dashboard and are no longer returned by the API." }, { status: 410 });
}
