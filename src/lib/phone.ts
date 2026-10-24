/** Phone numbers as international digits (E.164): a plus, then 8 to 15 digits. A bare 10-digit number is treated as US/Canada. */
export const E164 = /^\+[1-9]\d{7,14}$/;

export type PhoneResult = { ok: true; value: string | null } | { ok: false; error: string };

export function normalizePhone(input: string): PhoneResult {
  const raw = input.trim();
  if (!raw) return { ok: true, value: null };
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  let value: string;
  if (hasPlus) value = `+${digits}`;
  else if (digits.length === 10) value = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) value = `+${digits}`;
  else return { ok: false, error: "Enter the phone number with its country code, like +15551234567." };
  return E164.test(value) ? { ok: true, value } : { ok: false, error: "That phone number doesn't look right." };
}

export function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}•••@${domain ?? ""}`;
}
