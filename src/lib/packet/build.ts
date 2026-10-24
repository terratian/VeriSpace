import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
import { VERIFY_SCRIPT } from "./verifyScript";

export interface ExportRow {
  id: number | string;
  seq: number | string;
  actor_role: string;
  event_type: string;
  payload_text: string;
  frame_sha256: string | null;
  created_at_text: string;
  nonce: string;
  prev_hash: string | null;
  row_hash: string;
}
export interface PacketInput {
  property: { id: string; name: string; address?: string | null; timezone: string };
  stay: { id: string; guest_name: string | null; starts_at: string; ends_at: string } | null;
  rooms: { id: string; name: string }[];
  rows: Record<string, ExportRow[]>; // by room id
  anchors: { id: string; digest: string; heads: { roomId: string; seq: number; rowHash: string }[]; gen_time: string | null; tsa_url: string; reply: Uint8Array }[];
  photos: Map<string, Uint8Array>; // sha256 -> bytes; missing ones are listed with a reason
  wantedPhotos: string[];
  generatedAt: Date;
}

/** Entries that belong to a stay: its own, anything inside it, and the latest baseline per item before it. */
export function stayEntryIds(all: { id: number | string; room_id: string; event_type: string; created: number; payload: Record<string, unknown> | null }[], stay: { id: string; start: number; end: number }, baselineEvent: string): Set<string> {
  const latest = new Map<string, string>();
  const out = new Set<string>();
  for (const e of [...all].sort((a, b) => a.created - b.created)) {
    if (e.event_type === baselineEvent && e.created < stay.start) latest.set(`${e.room_id}:${typeof e.payload?.itemId === "string" ? e.payload.itemId : "room"}`, String(e.id));
    else if (e.event_type !== baselineEvent && (e.payload?.reservationId === stay.id || (e.created >= stay.start && e.created <= stay.end))) out.add(String(e.id));
    else if (e.event_type === baselineEvent && e.created >= stay.start && (e.payload?.reservationId === stay.id || e.created <= stay.end)) out.add(String(e.id));
  }
  for (const id of latest.values()) out.add(id);
  return out;
}

const README = `VeriSpace dispute packet

What is in here
  ledger.json     every entry for the property's rooms, in the exact form that was fingerprinted
  photos/         the original photos for this stay (named by their SHA-256 fingerprint)
  anchors/        signed timestamps from an outside authority (RFC 3161), when any exist
  anchors.json    what each timestamp covers
  verify.mjs      a checker anyone can run:  node verify.mjs

What it shows
  - who added each entry (role, and name where the link was issued to a named person) and when the server received it
  - the chain: each entry's fingerprint includes the one before it, so a changed or removed entry shows up
  - each photo's SHA-256 matches the fingerprint taken on the device before upload
  - the signed timestamps show the records existed in this form no later than the signed time

What it does not show
  - that a photo shows what it claims, or who caused any damage. Those are for people to judge.
  - the signed timestamp authority's own certificate chain is not bundled; use the authority's published CA file with openssl.
`;

export function buildPacket(input: PacketInput): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const entries = input.rooms.flatMap((r) =>
    (input.rows[r.id] ?? []).map((x) => ({
      roomId: r.id,
      id: String(x.id),
      seq: Number(x.seq),
      actorRole: x.actor_role,
      eventType: x.event_type,
      payloadText: x.payload_text,
      frameSha256: x.frame_sha256,
      createdAtText: x.created_at_text,
      nonce: x.nonce,
      prevHash: x.prev_hash,
      rowHash: x.row_hash,
    })),
  );
  const photos = input.wantedPhotos.map((sha) => {
    const bytes = input.photos.get(sha);
    if (!bytes) return { sha256: sha, file: null, reason: "not available" };
    if (createHash("sha256").update(bytes).digest("hex") !== sha) return { sha256: sha, file: null, reason: "stored file does not match its fingerprint" };
    files[`photos/${sha}.jpg`] = bytes;
    return { sha256: sha, file: `photos/${sha}.jpg` };
  });
  const anchors = input.anchors.map((a) => {
    const file = `anchors/${a.id}.tsr`;
    files[file] = a.reply;
    return { file, digest: a.digest, heads: a.heads, genTime: a.gen_time, tsaUrl: a.tsa_url };
  });
  files["ledger.json"] = strToU8(
    JSON.stringify({ generatedAt: input.generatedAt.toISOString(), property: input.property, stay: input.stay, rooms: input.rooms, entries, photos, anchors }, null, 1),
  );
  files["anchors.json"] = strToU8(JSON.stringify(anchors.map(({ heads, ...a }) => ({ ...a, rooms: heads.length })), null, 1));
  files["verify.mjs"] = strToU8(VERIFY_SCRIPT);
  files["README.txt"] = strToU8(README);
  return zipSync(files, { level: 6 });
}
