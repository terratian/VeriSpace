/**
 * Alerts to the owner when something needs attention. Email goes out through Resend and text messages
 * through Plivo, each only when its keys are set. Nothing here ever blocks recording an entry.
 */

import { sendEmail, sendSms, type Delivery } from "./deliver";

export { E164 } from "./phone";

export interface AlertContext {
  propertyName: string;
  roomName: string;
  eventType: string;
  note?: string;
  category?: string;
  byRole: string;
  /** Link to the property in the dashboard. */
  link?: string;
}

/** Entry types that should reach the owner. */
export function alertWorthy(eventType: string, payload: Record<string, unknown>): boolean {
  if (eventType === "issue_reported" || eventType === "damage_report") return true;
  return eventType === "condition_ack" && payload.agrees === false;
}

const WHO: Record<string, string> = { guest: "A guest", crew: "Your crew", manager: "A manager" };
const WHAT: Record<string, string> = {
  issue_reported: "reported a problem",
  damage_report: "reported damage",
  condition_ack: "says the room is not as shown",
};

export function alertText(c: AlertContext): { subject: string; body: string; sms: string } {
  const urgent = c.category === "safety";
  const line = `${WHO[c.byRole] ?? "Someone"} ${WHAT[c.eventType] ?? "added an entry"} in ${c.roomName} at ${c.propertyName}.`;
  const note = c.note ? `"${c.note.slice(0, 300)}"` : "";
  return {
    subject: `${urgent ? "Safety: " : ""}${c.propertyName}, ${c.roomName}: ${WHAT[c.eventType] ?? "new entry"}`,
    body: [line, note, c.link ? `Open it: ${c.link}` : ""].filter(Boolean).join("\n\n"),
    sms: `VeriSpace${urgent ? " SAFETY" : ""}: ${line} ${note}`.trim().slice(0, 300),
  };
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;

export async function sendAlerts(
  c: AlertContext,
  contacts: { email?: string | null; phone?: string | null },
  fetchFn: FetchFn = fetch,
  env: Env = process.env,
): Promise<{ email: Delivery; sms: Delivery }> {
  const text = alertText(c);
  return {
    email: contacts.email ? await sendEmail(contacts.email, text.subject, text.body, fetchFn, env) : "skipped",
    sms: contacts.phone ? await sendSms(contacts.phone, text.sms, fetchFn, env) : "skipped",
  };
}
