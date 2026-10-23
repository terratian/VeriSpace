import { createHash } from "node:crypto";

/**
 * Independent timestamps for the ledger (RFC 3161). The latest fingerprint of every room in a property
 * is combined into one digest and sent to an outside timestamp authority, which signs it with the
 * time. Anyone can check that signed proof without trusting this server's clock or database.
 */

export interface RoomHead {
  roomId: string;
  seq: number;
  rowHash: string;
}

/** One digest for a property's records: the latest sequence number and fingerprint of each room. */
export function anchorDigest(heads: RoomHead[]): string {
  const lines = [...heads].sort((a, b) => a.roomId.localeCompare(b.roomId)).map((h) => `${h.roomId}|${h.seq}|${h.rowHash}`);
  return createHash("sha256").update(`verispace-anchor-v1\n${lines.join("\n")}`).digest("hex");
}

// --- A small DER writer and reader, just enough for the timestamp request and response ---

const der = (tag: number, body: Uint8Array): Uint8Array => {
  const n = body.length;
  const len = n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255];
  return Uint8Array.from([tag, ...len, ...body]);
};
const cat = (...parts: Uint8Array[]): Uint8Array => Uint8Array.from(parts.flatMap((p) => [...p]));
const SHA256_OID = Uint8Array.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

const hexBytes = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));

/** A positive INTEGER from big-endian bytes. */
const derInteger = (bytes: Uint8Array): Uint8Array => {
  let b = [...bytes];
  while (b.length > 1 && b[0] === 0) b = b.slice(1);
  if (b[0] & 0x80) b = [0, ...b];
  return der(0x02, Uint8Array.from(b));
};

/** The request to send to a timestamp authority for one SHA-256 digest. Pass `nonce` bytes to bind the reply to it. */
export function timestampRequest(digestHex: string, nonce?: Uint8Array): Uint8Array {
  if (!/^[0-9a-f]{64}$/.test(digestHex)) throw new Error("digest must be a SHA-256 in hex");
  const imprint = der(0x30, cat(der(0x30, cat(SHA256_OID, Uint8Array.from([0x05, 0x00]))), der(0x04, hexBytes(digestHex))));
  return der(0x30, cat(derInteger(Uint8Array.from([1])), imprint, nonce ? derInteger(nonce) : new Uint8Array(), Uint8Array.from([0x01, 0x01, 0xff])));
}

interface Tlv {
  tag: number;
  start: number;
  end: number;
}
function readTlv(b: Uint8Array, at: number): Tlv | null {
  if (at + 2 > b.length) return null;
  const tag = b[at];
  let len = b[at + 1];
  let start = at + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n < 1 || n > 3 || start + n > b.length) return null;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | b[start + i];
    start += n;
  }
  return start + len <= b.length ? { tag, start, end: start + len } : null;
}

export interface TimestampReply {
  /** True when the authority issued a timestamp. */
  granted: boolean;
  status: number | null;
  /** The signed proof, as sent by the authority. Keep it whole: it is what anyone else verifies. */
  token: Uint8Array | null;
  /** The time the authority put in the proof. */
  genTime: Date | null;
}

/** Read the authority's reply: whether it granted the request, the signed proof, and the time in it. */
export function parseTimestampReply(bytes: Uint8Array): TimestampReply {
  const none: TimestampReply = { granted: false, status: null, token: null, genTime: null };
  const outer = readTlv(bytes, 0);
  if (!outer || outer.tag !== 0x30) return none;
  const info = readTlv(bytes, outer.start);
  if (!info || info.tag !== 0x30) return none;
  const st = readTlv(bytes, info.start);
  if (!st || st.tag !== 0x02) return none;
  let status = 0;
  for (let i = st.start; i < st.end; i++) status = (status << 8) | bytes[i];
  const granted = status === 0 || status === 1;
  if (!granted || info.end >= outer.end) return { ...none, status };
  const token = bytes.slice(info.end, outer.end);
  return { granted, status, token, genTime: findGeneralizedTime(token) };
}

/** The first GeneralizedTime in the proof, which for a timestamp token is the time of issue. */
function findGeneralizedTime(b: Uint8Array): Date | null {
  for (let i = 0; i < b.length - 3; i++) {
    if (b[i] !== 0x18) continue;
    const len = b[i + 1];
    if (len < 15 || len > 32 || i + 2 + len > b.length) continue;
    const text = String.fromCharCode(...b.slice(i + 2, i + 2 + len));
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(text);
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ""}Z`);
  }
  return null;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

/** Ask a timestamp authority to sign a digest. Throws if it can't be reached or refuses. */
export async function stampDigest(tsaUrl: string, digestHex: string, fetchFn: FetchFn = fetch): Promise<{ reply: Uint8Array; token: Uint8Array; genTime: Date | null }> {
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(8));
  const req = timestampRequest(digestHex, nonce);
  const res = await fetchFn(tsaUrl, { method: "POST", headers: { "content-type": "application/timestamp-query" }, body: req as unknown as BodyInit });
  if (!res.ok) throw new Error(`The timestamp authority answered ${res.status}.`);
  const raw = new Uint8Array(await res.arrayBuffer());
  const reply = parseTimestampReply(raw);
  if (!reply.granted || !reply.token) throw new Error(`The timestamp authority refused the request (status ${reply.status ?? "unreadable"}).`);
  return { reply: raw, token: reply.token, genTime: reply.genTime };
}
