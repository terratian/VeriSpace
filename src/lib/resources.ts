import { z } from "zod";

export interface GuestResource {
  id: string;
  title: string;
  kind: "link" | "pdf";
  /** A web address, or for a PDF a short-lived signed address. */
  url: string;
}

export interface ResourceRow {
  id: string;
  room_id: string;
  feature_id: string | null;
  kind: "link" | "pdf";
  title: string;
  url: string | null;
  storage_path: string | null;
}

export const BUCKET = "property-files";
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** Only web addresses: no javascript:, data: or file: links ever reach a guest. */
export function safeUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A PDF must sit under its own property's folder, so one manager can't point at another's file. */
export function pdfPathOk(propertyId: string, path: string): boolean {
  return path.startsWith(`${propertyId}/`) && !path.includes("..") && path.toLowerCase().endsWith(".pdf") && path.length <= 300;
}

export const resourceSchema = z.object({
  roomId: z.guid(),
  featureId: z.guid().nullable(),
  title: z.string().trim().min(1, "Give it a title.").max(80, "Keep the title under 80 characters."),
});

export const featureEditSchema = z.object({
  id: z.guid(),
  name: z.string().trim().min(1, "Give the feature a name.").max(80, "Keep the name under 80 characters."),
  kind: z.string(),
  advertised: z.boolean(),
  details: z.string().trim().max(500, "Keep details under 500 characters."),
});
