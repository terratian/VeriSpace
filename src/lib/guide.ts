import { z } from "zod";

/** What a manager writes for a property: shared procedures, per-room guest information, crew checklists. */

export const CONTENT_KINDS = ["tutorial", "allergen", "note"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const KIND_LABELS: Record<ContentKind, string> = {
  tutorial: "How-to",
  allergen: "Allergen or health note",
  note: "Good to know",
};

/** Mirrors the database check constraints. */
export const LIMITS = { procedure: 4000, title: 120, body: 2000, task: 160 } as const;

export interface RoomContent {
  id: string;
  kind: ContentKind;
  title: string;
  body: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  requiresPhoto: boolean;
}

export interface Procedures {
  checkin: string;
  checkout: string;
  rules: string;
}

export const EMPTY_PROCEDURES: Procedures = { checkin: "", checkout: "", rules: "" };

const bounded = (max: number, what: string) =>
  z.string().trim().max(max, `${what} is too long. Keep it under ${max} characters.`);

export const proceduresSchema = z.object({
  propertyId: z.guid(),
  checkin: bounded(LIMITS.procedure, "The check-in instructions"),
  checkout: bounded(LIMITS.procedure, "The checkout instructions"),
  rules: bounded(LIMITS.procedure, "The house rules"),
});

export const contentSchema = z.object({
  roomId: z.guid(),
  kind: z.enum(CONTENT_KINDS, { message: "Choose a type" }),
  title: z
    .string()
    .trim()
    .min(1, "Enter a title")
    .max(LIMITS.title, `The title is too long. Keep it under ${LIMITS.title} characters.`),
  body: bounded(LIMITS.body, "The details"),
});

export const checklistSchema = z.object({
  roomId: z.guid(),
  label: z
    .string()
    .trim()
    .min(1, "Enter the task")
    .max(LIMITS.task, `The task is too long. Keep it under ${LIMITS.task} characters.`),
  requiresPhoto: z.boolean(),
});

export function toContent(row: { id: string; kind: string; title: string; body: string | null }): RoomContent {
  const kind = (CONTENT_KINDS as readonly string[]).includes(row.kind) ? (row.kind as ContentKind) : "note";
  return { id: row.id, kind, title: row.title, body: row.body ?? "" };
}

export function toChecklistItem(row: { id: string; label: string; requires_photo: boolean | null }): ChecklistItem {
  return { id: row.id, label: row.label, requiresPhoto: row.requires_photo === true };
}

/** Allergen notes first, then how-tos, then everything else. Entries of one kind keep their order. */
export function sortContent(items: RoomContent[]): RoomContent[] {
  const rank: Record<ContentKind, number> = { allergen: 0, tutorial: 1, note: 2 };
  return [...items].sort((a, b) => rank[a.kind] - rank[b.kind]);
}
