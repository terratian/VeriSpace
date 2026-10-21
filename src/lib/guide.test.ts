import { describe, expect, it } from "vitest";
import { checklistSchema, contentSchema, proceduresSchema, sortContent, toChecklistItem, toContent, type RoomContent } from "./guide";

const ID = "00000000-0000-0000-0000-0000000000a1";

describe("guide schemas", () => {
  it("accepts valid content and trims it", () => {
    const parsed = contentSchema.parse({ roomId: ID, kind: "allergen", title: "  Feather pillows ", body: " Two on the sofa " });
    expect(parsed).toMatchObject({ kind: "allergen", title: "Feather pillows", body: "Two on the sofa" });
  });

  it("rejects an empty title, an unknown kind, and oversized text", () => {
    expect(contentSchema.safeParse({ roomId: ID, kind: "note", title: "  ", body: "" }).success).toBe(false);
    expect(contentSchema.safeParse({ roomId: ID, kind: "bogus", title: "x", body: "" }).success).toBe(false);
    expect(contentSchema.safeParse({ roomId: ID, kind: "note", title: "x", body: "y".repeat(2001) }).success).toBe(false);
    expect(contentSchema.safeParse({ roomId: ID, kind: "note", title: "x".repeat(121), body: "" }).success).toBe(false);
  });

  it("validates checklist tasks", () => {
    expect(checklistSchema.safeParse({ roomId: ID, label: "Empty the bins", requiresPhoto: false }).success).toBe(true);
    expect(checklistSchema.safeParse({ roomId: ID, label: "", requiresPhoto: true }).success).toBe(false);
    expect(checklistSchema.safeParse({ roomId: ID, label: "x".repeat(161), requiresPhoto: true }).success).toBe(false);
  });

  it("allows empty procedures but not oversized ones", () => {
    expect(proceduresSchema.safeParse({ propertyId: ID, checkin: "", checkout: "", rules: "" }).success).toBe(true);
    expect(proceduresSchema.safeParse({ propertyId: ID, checkin: "x".repeat(4001), checkout: "", rules: "" }).success).toBe(false);
    expect(proceduresSchema.safeParse({ propertyId: "nope", checkin: "", checkout: "", rules: "" }).success).toBe(false);
  });
});

describe("row mapping", () => {
  it("falls back to a note for an unknown kind and a missing body", () => {
    expect(toContent({ id: "1", kind: "weird", title: "t", body: null })).toEqual({ id: "1", kind: "note", title: "t", body: "" });
  });

  it("maps checklist rows, treating null as no photo needed", () => {
    expect(toChecklistItem({ id: "1", label: "Bins", requires_photo: null }).requiresPhoto).toBe(false);
    expect(toChecklistItem({ id: "2", label: "Sofa", requires_photo: true }).requiresPhoto).toBe(true);
  });
});

describe("sortContent", () => {
  it("puts allergen notes first and keeps order within a kind", () => {
    const items: RoomContent[] = [
      { id: "n1", kind: "note", title: "n1", body: "" },
      { id: "t1", kind: "tutorial", title: "t1", body: "" },
      { id: "a1", kind: "allergen", title: "a1", body: "" },
      { id: "t2", kind: "tutorial", title: "t2", body: "" },
      { id: "a2", kind: "allergen", title: "a2", body: "" },
    ];
    expect(sortContent(items).map((i) => i.id)).toEqual(["a1", "a2", "t1", "t2", "n1"]);
  });
});
