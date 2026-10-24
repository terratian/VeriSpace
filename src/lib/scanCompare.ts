import sharp from "sharp";
import { GRID, compareGrids, type GridComparison } from "@/lib/imgdiff";
import { lookDistance, type ScanFrame, type ScanSet } from "@/lib/scan";

/** Pair each frame of the new scan with the frame of the old scan facing nearly the same way. */
export function pairFrames(current: ScanFrame[], previous: ScanFrame[], maxDegrees = 20): { now: ScanFrame; before: ScanFrame }[] {
  const out: { now: ScanFrame; before: ScanFrame }[] = [];
  for (const now of current) {
    let best: ScanFrame | null = null;
    let bestD = Infinity;
    for (const p of previous) {
      const d = lookDistance(now, p);
      if (d < bestD) (best = p), (bestD = d);
    }
    if (best && bestD <= maxDegrees) out.push({ now, before: best });
  }
  return out;
}

/** A photo reduced to a GRID x GRID brightness grid. */
export async function lumaGrid(image: Uint8Array): Promise<number[]> {
  const raw = await sharp(image).rotate().resize(GRID, GRID, { fit: "fill", kernel: "lanczos3" }).greyscale().raw().toBuffer();
  return Array.from(raw);
}

export interface FrameComparison extends GridComparison {
  index: number;
  yaw: number;
  pitch: number;
  beforeSha: string;
  nowSha: string;
}

export async function compareScans(current: ScanSet, previous: ScanSet, load: (sha256: string) => Promise<Uint8Array | null>): Promise<{ results: FrameComparison[]; unpaired: number }> {
  const pairs = pairFrames(current.frames, previous.frames);
  const results: FrameComparison[] = [];
  let next = 0;
  async function worker() {
    while (next < pairs.length) {
      const { now, before } = pairs[next++];
      const [a, b] = await Promise.all([load(before.sha256), load(now.sha256)]);
      if (!a || !b) continue;
      const cmp = compareGrids(await lumaGrid(a), await lumaGrid(b));
      results.push({ ...cmp, index: now.index, yaw: now.yaw, pitch: now.pitch, beforeSha: before.sha256, nowSha: now.sha256 });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  results.sort((x, y) => x.index - y.index);
  return { results, unpaired: current.frames.length - pairs.length };
}
