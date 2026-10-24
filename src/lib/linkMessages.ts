/** The words that go with a link. Short, plain, and written to be translated later. */
export interface LinkMessageArgs {
  role: "guest" | "crew";
  name: string | null;
  propertyName: string;
  url: string;
  /** When the link stops working, already formatted for the property's time zone. */
  until: string;
}

export function linkSms(a: LinkMessageArgs): string {
  const first = a.name?.trim().split(/\s+/)[0];
  return a.role === "guest"
    ? `${first ? `Hi ${first}, welcome` : "Welcome"} to ${a.propertyName}. Your VeriStay guide for check-in, your stay and checkout: ${a.url} (works until ${a.until}). Reply STOP to opt out.`
    : `${first ? `Hi ${first}. ` : ""}Turnover at ${a.propertyName}. Your VeriService steps: ${a.url} (works until ${a.until}). Reply STOP to opt out.`;
}

export function linkEmail(a: LinkMessageArgs): { subject: string; text: string } {
  const first = a.name?.trim().split(/\s+/)[0];
  if (a.role === "guest") {
    return {
      subject: `Your stay at ${a.propertyName}`,
      text: `${first ? `Hi ${first},` : "Hello,"}\n\nHere is your VeriStay guide for ${a.propertyName}: check-in, help with what is in the house, and checkout.\n\n${a.url}\n\nThe link works until ${a.until}. It is made for you, so please don't share it.`,
    };
  }
  return {
    subject: `Turnover at ${a.propertyName}`,
    text: `${first ? `Hi ${first},` : "Hello,"}\n\nYour VeriService steps for the turnover at ${a.propertyName}:\n\n${a.url}\n\nThe link works until ${a.until}. It is made for you, so please don't share it.`,
  };
}
