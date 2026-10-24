/** Sending a text or an email. Each works only when its keys are set, and reports plainly when not. */
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
type Env = Record<string, string | undefined>;
export type Delivery = "sent" | "skipped" | "failed";

export const smsConfigured = (env: Env = process.env) => Boolean(env.PLIVO_AUTH_ID && env.PLIVO_AUTH_TOKEN && env.PLIVO_FROM);
export const emailConfigured = (env: Env = process.env) => Boolean(env.RESEND_API_KEY && env.ALERT_FROM_EMAIL);

export async function sendSms(to: string, text: string, fetchFn: FetchFn = fetch, env: Env = process.env): Promise<Delivery> {
  if (!smsConfigured(env) || !/^\+[1-9]\d{7,14}$/.test(to)) return "skipped";
  try {
    const res = await fetchFn(`https://api.plivo.com/v1/Account/${encodeURIComponent(env.PLIVO_AUTH_ID!)}/Message/`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${env.PLIVO_AUTH_ID}:${env.PLIVO_AUTH_TOKEN}`).toString("base64")}`, "content-type": "application/json" },
      body: JSON.stringify({ src: env.PLIVO_FROM, dst: to.replace("+", ""), text }),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function sendEmail(to: string, subject: string, text: string, fetchFn: FetchFn = fetch, env: Env = process.env): Promise<Delivery> {
  if (!emailConfigured(env)) return "skipped";
  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.ALERT_FROM_EMAIL, to: [to], subject, text }),
    });
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
