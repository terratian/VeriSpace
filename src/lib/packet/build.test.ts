import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { unzipSync } from "fflate";
import { buildPacket, stayEntryIds, type ExportRow } from "./build";
import { anchorDigest } from "../anchor";

const sha = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const ROOM = "11111111-1111-4111-8111-111111111111";
const photo = Buffer.from("pretend jpeg");

function chain(): ExportRow[] {
  const rows: ExportRow[] = [];
  let prev: string | null = null;
  for (let seq = 1; seq <= 3; seq++) {
    const row: ExportRow = { id: seq, seq, actor_role: "crew", event_type: "baseline_photo", payload_text: `{"n": ${seq}}`, frame_sha256: seq === 2 ? sha(photo) : null, created_at_text: `2026-10-23 12:0${seq}:00+00`, nonce: `n${seq}`, prev_hash: prev, row_hash: "" };
    row.row_hash = sha([prev ?? "", row.nonce, ROOM, seq, row.actor_role, row.event_type, row.payload_text, row.frame_sha256 ?? "", row.created_at_text].join("|"));
    prev = row.row_hash;
    rows.push(row);
  }
  return rows;
}

function run(rows: ExportRow[], photoBytes: Uint8Array) {
  const orig = chain();
  const heads = [{ roomId: ROOM, seq: 3, rowHash: orig[2].row_hash }];
  const zip = buildPacket({
    property: { id: "p", name: "Cabin", timezone: "UTC" },
    stay: null,
    rooms: [{ id: ROOM, name: "Den" }],
    rows: { [ROOM]: rows },
    anchors: [{ id: "a1", digest: anchorDigest(heads), heads, gen_time: "2026-10-23T12:10:00Z", tsa_url: "https://tsa.test", reply: Uint8Array.from([1, 2, 3]) }],
    photos: new Map([[sha(photo), photoBytes]]),
    wantedPhotos: [sha(photo)],
    generatedAt: new Date("2026-10-23T13:00:00Z"),
  });
  const dir = mkdtempSync(join(tmpdir(), "packet-"));
  for (const [name, bytes] of Object.entries(unzipSync(zip))) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), bytes);
  }
  const r = spawnSync("node", [join(dir, "verify.mjs")], { encoding: "utf8" });
  return { dir, out: r.stdout, code: r.status };
}

describe("dispute packet", () => {
  it("verifies cleanly when nothing was altered", () => {
    const r = run(chain(), photo);
    expect(r.out).toContain("Everything in this packet is consistent");
    expect(r.code).toBe(0);
  });
  it("flags an edited entry", () => {
    const rows = chain();
    rows[1] = { ...rows[1], payload_text: '{"n": 99}' };
    const r = run(rows, photo);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/entry 2: contents do not match/);
  });
  it("flags a removed entry", () => {
    const rows = chain();
    const r = run([rows[0], rows[2]], photo);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/missing between 1 and 3|differ from what was timestamped/);
  });
  it("leaves out a photo whose bytes do not match, and says so", () => {
    const r = run(chain(), Buffer.from("tampered"));
    expect(r.out).toContain("not included");
  });
});

describe("stayEntryIds", () => {
  it("takes the stay's entries and the latest earlier baseline per item", () => {
    const mk = (id: number, ev: string, t: number, p: Record<string, unknown> = {}) => ({ id, room_id: "r", event_type: ev, created: t, payload: p });
    const ids = stayEntryIds([mk(1, "baseline_photo", 1), mk(2, "baseline_photo", 5), mk(3, "issue_reported", 12), mk(4, "issue_reported", 99)], { id: "s", start: 10, end: 20 }, "baseline_photo");
    expect([...ids].sort()).toEqual(["2", "3"]);
  });
});
