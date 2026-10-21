import { describe, expect, it } from "vitest";
import { byline, openIssues, type LedgerEntry } from "./issues";

let n = 0;
const entry = (event_type: string, payload: unknown, over: Partial<LedgerEntry> = {}): LedgerEntry => ({
  id: ++n,
  seq: n,
  room_id: "r1",
  event_type,
  actor_role: "guest",
  created_at: "2026-10-21T12:00:00Z",
  payload,
  frame_sha256: null,
  ...over,
});

describe("open issues", () => {
  it("lists reports that nothing has resolved, oldest first", () => {
    const a = entry("issue_reported", { note: "Out of dish soap", category: "supply" });
    const b = entry("issue_reported", { note: "Smoke alarm disabled", category: "safety" });
    const open = openIssues([a, b]);
    expect(open.map((i) => i.note)).toEqual(["Out of dish soap", "Smoke alarm disabled"]);
    expect(open[1].urgent).toBe(true);
    expect(open[0].urgent).toBe(false);
  });
  it("drops an issue once a later entry resolves it", () => {
    const a = entry("issue_reported", { note: "Washer stopped working" });
    const b = entry("issue_reported", { note: "Netflix down in bedroom" });
    const fix = entry("issue_resolved", { issueId: a.id, note: "Replaced pump" }, { actor_role: "crew" });
    expect(openIssues([a, b, fix]).map((i) => i.note)).toEqual(["Netflix down in bedroom"]);
  });
  it("counts crew damage reports as issues and lets them be resolved", () => {
    const d = entry("damage_report", { note: "Cracked lamp" }, { actor_role: "crew" });
    expect(openIssues([d])[0]).toMatchObject({ kind: "damage", category: "damage" });
    expect(openIssues([d, entry("issue_resolved", { issueId: d.id })])).toEqual([]);
  });
  it("keeps who and what: feature, photo, and the name the link was issued to", () => {
    const a = entry("issue_reported", { note: "TV remote missing", featureId: "f1", issuedTo: "Maria" }, { frame_sha256: "a".repeat(64), actor_role: "crew" });
    expect(openIssues([a])[0]).toMatchObject({ featureId: "f1", issuedTo: "Maria", frameSha256: "a".repeat(64), actorRole: "crew" });
  });
  it("ignores other entries and malformed payloads", () => {
    const open = openIssues([entry("clean_end", {}), entry("issue_reported", null), entry("issue_resolved", { issueId: "7" })]);
    expect(open).toHaveLength(1);
    expect(open[0].note).toBe("No description");
  });
});

describe("byline", () => {
  it("names the role and the person when known", () => {
    expect(byline("crew", { issuedTo: "Maria, Sparkle Cleaning" })).toBe("Crew, Maria, Sparkle Cleaning");
    expect(byline("manager", {})).toBe("Owner");
    expect(byline("guest", null)).toBe("Guest");
  });
});
