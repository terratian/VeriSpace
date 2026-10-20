import { describe, expect, it } from "vitest";
import { createPhotoStore, isJpeg, photoKey, sha256Hex, storageConfigFromEnv, type StorageConfig } from "./storage";

const PROPERTY = "00000000-0000-0000-0000-000000000001";
const SHA = "a".repeat(64);
const CONFIG: StorageConfig = {
  endpoint: "https://acct.r2.cloudflarestorage.com",
  bucket: "vs-photos",
  accessKeyId: "AKIDEXAMPLE",
  secretAccessKey: "secret-example-key",
  region: "auto",
};

describe("storageConfigFromEnv", () => {
  const full = {
    STORAGE_ENDPOINT: "https://acct.r2.cloudflarestorage.com/",
    STORAGE_BUCKET: "b",
    STORAGE_ACCESS_KEY_ID: "k",
    STORAGE_SECRET_ACCESS_KEY: "s",
  };
  it("reads a complete configuration, trimming the trailing slash and defaulting the region", () => {
    expect(storageConfigFromEnv(full)).toEqual({
      endpoint: "https://acct.r2.cloudflarestorage.com",
      bucket: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
      region: "auto",
    });
  });
  it("returns null when any variable is missing", () => {
    for (const missing of Object.keys(full)) {
      expect(storageConfigFromEnv({ ...full, [missing]: undefined })).toBeNull();
    }
  });
});

describe("photoKey", () => {
  it("keys a photo by property and fingerprint", () => {
    expect(photoKey(PROPERTY, SHA)).toBe(`frames/${PROPERTY}/${SHA}.jpg`);
  });
  it("rejects anything that could escape the prefix", () => {
    expect(() => photoKey("../x", SHA)).toThrow();
    expect(() => photoKey(PROPERTY, "../../etc/passwd")).toThrow();
    expect(() => photoKey(PROPERTY, "A".repeat(64))).toThrow();
  });
});

describe("helpers", () => {
  it("recognises JPEG bytes only", () => {
    expect(isJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(isJpeg(new Uint8Array())).toBe(false);
  });
  it("matches the SHA-256 test vector for 'abc'", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("createPhotoStore", () => {
  it("signs a PUT to the path-style object URL", async () => {
    let seen: Request | undefined;
    const store = createPhotoStore(CONFIG, async (input) => {
      seen = input as Request;
      return new Response(null, { status: 200 });
    });
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    await store.put(PROPERTY, SHA, bytes);
    expect(seen?.method).toBe("PUT");
    expect(seen?.url).toBe(`https://acct.r2.cloudflarestorage.com/vs-photos/frames/${PROPERTY}/${SHA}.jpg`);
    expect(seen?.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request/);
    expect((await seen!.arrayBuffer()).byteLength).toBe(bytes.byteLength);
  });

  it("throws when storage rejects the upload", async () => {
    const store = createPhotoStore(CONFIG, async () => new Response(null, { status: 403 }));
    await expect(store.put(PROPERTY, SHA, new Uint8Array([0xff, 0xd8, 0xff]))).rejects.toThrow(/403/);
  });

  it("reports whether a photo exists", async () => {
    const respond = (status: number) => createPhotoStore(CONFIG, async () => new Response(null, { status }));
    expect(await respond(200).exists(PROPERTY, SHA)).toBe(true);
    expect(await respond(404).exists(PROPERTY, SHA)).toBe(false);
    await expect(respond(500).exists(PROPERTY, SHA)).rejects.toThrow(/500/);
  });

  it("makes a short-lived signed link with the signature in the query", async () => {
    const store = createPhotoStore(CONFIG);
    const url = new URL(await store.signedUrl(PROPERTY, SHA, 300, new Date("2026-10-20T12:00:00Z")));
    expect(url.origin + url.pathname).toBe(`https://acct.r2.cloudflarestorage.com/vs-photos/frames/${PROPERTY}/${SHA}.jpg`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-Date")).toBe("20261020T120000Z");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get("X-Amz-Credential")).toBe("AKIDEXAMPLE/20261020/auto/s3/aws4_request");
  });
});
