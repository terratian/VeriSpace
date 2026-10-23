import { notFound } from "next/navigation";
import { ScanStudioLoader } from "@/components/dashboard/ScanViewerLoader";
import { demoEnabled } from "@/lib/demo";
import { scanTargets } from "@/lib/scan";

// Demo: the owner's scan studio (pins and measuring) with stand-in photos. Saving needs a real sign-in.
const tile = (t: { yaw: number; pitch: number }) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="480" height="640" fill="hsl(${Math.round((t.yaw / 360) * 300)},30%,28%)"/><text x="240" y="330" fill="#fff" font-size="48" text-anchor="middle" font-family="sans-serif">${t.yaw}°</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export default function Page() {
  if (!demoEnabled()) notFound();
  const frames = scanTargets().map((t, i) => ({ index: i, yaw: t.yaw, pitch: t.pitch, roll: 0, width: 480, height: 640, url: tile(t) }));
  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <ScanStudioLoader roomId="00000000-0000-0000-0000-0000000000a1" scanId="11111111-1111-4111-8111-111111111111" frames={frames} pins={[]} assets={[{ id: "f1", name: "Smart TV", status: "working" }]} />
    </main>
  );
}
