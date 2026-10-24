/**
 * Alerts to the owner when something needs attention. Email goes out through Resend and text messages
 * through Plivo, each only when its keys are set. Nothing here ever blocks recording an entry.
 */

export const E164 = /^\+[1-9]\d{7,14}$/;

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
export type Delivery = "sent" | "skipped" | "failed";

export async function sendAlerts(
  c: AlertContext,
  contacts: { email?: string | null; phone?: string | null },
  fetchFn: FetchFn = fetch,
  env: Env = process.env,
): Promise<{ email: Delivery; sms: Delivery }> {
  const text = alertText(c);
  const result: { email: Delivery; sms: Delivery } = { email: "skipped", sms: "skipped" };

  if (contacts.email && env.RESEND_API_KEY && env.ALERT_FROM_EMAIL) {
    try {
      const res = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.ALERT_FROM_EMAIL, to: [contacts.email], subject: text.subject, text: text.body }),
      });
      result.email = res.ok ? "sent" : "failed";
    } catch {
      result.email = "failed";
    }
  }

  if (contacts.phone && E164.test(contacts.phone) && env.PLIVO_AUTH_ID && env.PLIVO_AUTH_TOKEN && env.PLIVO_FROM) {
    try {
      const res = await fetchFn(`https://api.plivo.com/v1/Account/${encodeURIComponent(env.PLIVO_AUTH_ID)}/Message/`, {
        method: "POST",
        headers: { authorization: `Basic ${Buffer.from(`${env.PLIVO_AUTH_ID}:${env.PLIVO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/json" },
        body: JSON.stringify({ src: env.PLIVO_FROM, dst: contacts.phone.replace("+", ""), text: text.sms }),
      });
      result.sms = res.ok ? "sent" : "failed";
    } catch {
      result.sms = "failed";
    }
  }
  return result;
}
