import { notFound } from "next/navigation";
import { ScanViewerLoader } from "@/components/dashboard/ScanViewerLoader";
import { demoEnabled } from "@/lib/demo";
import { scanTargets } from "@/lib/scan";

// Demo: the look-around viewer with labelled stand-in photos and pinned assets, so direction, overlap and pins can be checked.
const label = (t: { yaw: number; pitch: number }) => {
  const hue = Math.round((t.yaw / 360) * 300);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="hsl(${hue},45%,${t.pitch > 0 ? 40 : t.pitch < 0 ? 22 : 32}%)"/><rect x="8" y="8" width="464" height="624" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><text x="240" y="300" fill="#fff" font-size="56" text-anchor="middle" font-family="sans-serif">${t.yaw}°</text><text x="240" y="370" fill="#fff" font-size="40" text-anchor="middle" font-family="sans-serif">pitch ${t.pitch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export default function Page() {
  if (!demoEnabled()) notFound();
  const frames = scanTargets().map((t, i) => ({ index: i, yaw: t.yaw, pitch: t.pitch, roll: 0, width: 480, height: 640, url: label(t) }));
  const pins = [
    { id: "p1", featureId: "f1", label: "Gas fireplace", yaw: 0, pitch: -5, status: "degraded" as const },
    { id: "p2", featureId: "f2", label: "Smart TV", yaw: 60, pitch: 5, status: "working" as const },
    { id: "p3", featureId: "f3", label: "Hot tub", yaw: 200, pitch: -10, status: "out_of_service" as const },
  ];
  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <ScanViewerLoader frames={frames} pins={pins} />
    </main>
  );
}
