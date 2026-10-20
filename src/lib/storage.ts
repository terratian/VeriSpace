import { AwsClient } from "aws4fetch";
import { MAX_PHOTO_BYTES } from "./capture";
import type { PhotoIndex } from "./ledger";

export { MAX_PHOTO_BYTES };

/**
 * Photo storage over the S3 API, so the provider is a config choice (Cloudflare R2 by default;
 * Supabase Storage's S3 endpoint works too). Photos are keyed by their SHA-256 under the property,
 * so a key can be recomputed from a ledger row and an object never needs a database record.
 */

export interface StorageConfig {
  /** For R2: https://<account id>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** R2 uses "auto". */
  region: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

/** Returns null when storage isn't configured, so local development works without a bucket. */
export function storageConfigFromEnv(source: Record<string, string | undefined> = process.env): StorageConfig | null {
  const endpoint = source.STORAGE_ENDPOINT;
  const bucket = source.STORAGE_BUCKET;
  const accessKeyId = source.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = source.STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint: endpoint.replace(/\/+$/, ""), bucket, accessKeyId, secretAccessKey, region: source.STORAGE_REGION || "auto" };
}

export function photoKey(propertyId: string, sha256: string): string {
  if (!UUID.test(propertyId)) throw new Error("invalid property id");
  if (!SHA256.test(sha256)) throw new Error("invalid sha-256");
  return `frames/${propertyId.toLowerCase()}/${sha256}.jpg`;
}

/** True when the bytes start with the JPEG signature. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PhotoStore extends PhotoIndex {
  put(propertyId: string, sha256: string, bytes: Uint8Array): Promise<void>;
  /** A short-lived link for showing one photo to its owner. */
  signedUrl(propertyId: string, sha256: string, expiresInSeconds?: number, now?: Date): Promise<string>;
}

type FetchFn = (input: Request | string | URL, init?: RequestInit) => Promise<Response>;

export function createPhotoStore(config: StorageConfig, fetchFn: FetchFn = fetch): PhotoStore {
  const aws = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
    retries: 2,
  });
  // Path-style addressing works for R2 and for Supabase Storage's S3 endpoint.
  const urlFor = (key: string) => `${config.endpoint}/${config.bucket}/${key}`;

  return {
    async put(propertyId, sha256, bytes) {
      const req = await aws.sign(urlFor(photoKey(propertyId, sha256)), {
        method: "PUT",
        headers: { "content-type": "image/jpeg" },
        body: bytes as BodyInit,
      });
      const res = await fetchFn(req);
      if (!res.ok) throw new Error(`photo storage rejected the upload (${res.status})`);
    },

    async exists(propertyId, sha256) {
      const req = await aws.sign(urlFor(photoKey(propertyId, sha256)), { method: "HEAD" });
      const res = await fetchFn(req);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`photo storage lookup failed (${res.status})`);
      return true;
    },

    async signedUrl(propertyId, sha256, expiresInSeconds = 300, now = new Date()) {
      const url = new URL(urlFor(photoKey(propertyId, sha256)));
      url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
      const datetime = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
      const signed = await aws.sign(url.toString(), { method: "GET", aws: { signQuery: true, datetime } });
      return signed.url;
    },
  };
}

/** The configured store, or null when STORAGE_* variables aren't set. */
export function photoStoreFromEnv(): PhotoStore | null {
  const config = storageConfigFromEnv();
  return config ? createPhotoStore(config) : null;
}
