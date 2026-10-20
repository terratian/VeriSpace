import { JPEG_QUALITY, MAX_EDGE, MAX_PHOTO_BYTES, scaleToFit } from "./capture";

const QUALITY_STEPS = [JPEG_QUALITY, 0.8, 0.7, 0.6];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Draw an image or video frame at a size that fits MAX_EDGE and encode it as a JPEG small enough to
 * upload. It lowers quality first, then size. The returned bytes are exactly what gets hashed and
 * stored; nothing edits them afterwards.
 */
export async function encodeJpeg(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  let edge = MAX_EDGE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = scaleToFit(width, height, edge);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser can't process photos.");
    ctx.drawImage(source, 0, 0, size.width, size.height);
    for (const quality of QUALITY_STEPS) {
      const blob = await toBlob(canvas, quality);
      if (!blob) throw new Error("This browser couldn't encode the photo.");
      if (blob.size <= MAX_PHOTO_BYTES) return { blob, width: size.width, height: size.height };
    }
    edge = Math.round(edge * 0.75);
  }
  throw new Error("The photo is too large to upload.");
}
