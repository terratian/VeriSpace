/**
 * The public origin to put in links. APP_ORIGIN wins when set; otherwise it is derived from the
 * request headers (works for localhost and for hosts behind a proxy that sets x-forwarded-*).
 */
export function requestOrigin(
  headers: { get(name: string): string | null },
  configured: string | undefined = process.env.APP_ORIGIN,
): string {
  if (configured) return configured.replace(/\/+$/, "");
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0].trim();
  if (!host) throw new Error("Cannot work out the app's public URL. Set APP_ORIGIN.");
  const forwarded = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwarded ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
