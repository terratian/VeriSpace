/** The standalone checker shipped inside every dispute packet. Plain Node, no dependencies. */
export const VERIFY_SCRIPT = String.raw`// VeriSpace dispute packet checker. Run:  node verify.mjs
// Needs only Node 18+. It re-computes every fingerprint in this packet and tells you what matches.
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const data = JSON.parse(readFileSync(join(here, "ledger.json"), "utf8"));
let bad = 0;
const fail = (m) => { bad++; console.log("  PROBLEM  " + m); };

console.log("1. Entry fingerprints and chain links");
const byRoom = new Map();
for (const e of data.entries) (byRoom.get(e.roomId) ?? byRoom.set(e.roomId, []).get(e.roomId)).push(e);
const rowHash = new Map();
for (const [roomId, rows] of byRoom) {
  rows.sort((a, b) => a.seq - b.seq);
  let prev = null;
  for (const e of rows) {
    const want = sha([e.prevHash ?? "", e.nonce, roomId, e.seq, e.actorRole, e.eventType, e.payloadText, e.frameSha256 ?? "", e.createdAtText].join("|"));
    if (want !== e.rowHash) fail("room " + roomId + " entry " + e.seq + ": contents do not match its fingerprint");
    if (prev && (e.prevHash ?? "") !== prev.rowHash) fail("room " + roomId + " entry " + e.seq + ": does not follow entry " + prev.seq);
    if (!prev && e.seq !== 1) fail("room " + roomId + ": export starts at entry " + e.seq + ", not 1");
    if (prev && e.seq !== prev.seq + 1) fail("room " + roomId + ": entries missing between " + prev.seq + " and " + e.seq);
    rowHash.set(roomId + ":" + e.seq, e.rowHash);
    prev = e;
  }
  console.log("  room " + roomId + ": " + rows.length + " entries checked");
}

console.log("2. Photos");
let photos = 0;
for (const p of data.photos) {
  if (!p.file) { console.log("  not included: " + p.sha256.slice(0, 16) + " (" + p.reason + ")"); continue; }
  const path = join(here, p.file);
  if (!existsSync(path)) { fail("missing file " + p.file); continue; }
  if (sha(readFileSync(path)) !== p.sha256) fail(p.file + " does not match the fingerprint recorded when it was taken");
  else photos++;
}
console.log("  " + photos + " photo(s) match their recorded fingerprints");

console.log("3. Independent timestamps");
for (const a of data.anchors) {
  const lines = [...a.heads].sort((x, y) => x.roomId.localeCompare(y.roomId)).map((h) => h.roomId + "|" + h.seq + "|" + h.rowHash);
  const digest = sha("verispace-anchor-v1\n" + lines.join("\n"));
  if (digest !== a.digest) { fail(a.file + ": fingerprint list does not produce the timestamped digest"); continue; }
  const missing = a.heads.filter((h) => rowHash.get(h.roomId + ":" + h.seq) !== h.rowHash);
  if (missing.length) fail(a.file + ": " + missing.length + " room(s) differ from what was timestamped");
  else console.log("  " + a.file + ": matches the records. Signed time " + (a.genTime ?? "unknown") + ".");
  console.log("    to check the authority's signature: openssl ts -verify -digest " + a.digest + " -sha256 -in " + a.file + " -CAfile <authority CA bundle>");
}
if (!data.anchors.length) console.log("  none yet for this property");

console.log(bad ? "\n" + bad + " problem(s) found." : "\nEverything in this packet is consistent.");
process.exit(bad ? 1 : 0);
`;
