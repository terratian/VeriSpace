/**
 * Client-side frame hashing (AirCover invariant): the raw, unedited capture is hashed with
 * Web Crypto SHA-256 on the device before anything else touches it. Only the hash is
 * submitted to the ledger.
 */

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer so views over shared memory hash exactly their bytes.
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", copy));
}

export async function hashFrame(frame: Blob): Promise<string> {
  return sha256Hex(await frame.arrayBuffer());
}
