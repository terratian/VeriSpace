import { notFound } from "next/navigation";
import { ScanViewerLoader } from "@/components/dashboard/ScanViewerLoader";
import { demoEnabled } from "@/lib/demo";
import { scanTargets } from "@/lib/scan";

// Demo: the look-around viewer with labelled stand-in photos, so direction and overlap can be checked.
const label = (t: { yaw: number; pitch: number }) => {
  const hue = Math.round((t.yaw / 360) * 300);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640" viewBox="0 0 480 640"><rect width="480" height="640" fill="hsl(${hue},45%,${t.pitch > 0 ? 40 : t.pitch < 0 ? 22 : 32}%)"/><rect x="8" y="8" width="464" height="624" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><text x="240" y="300" fill="#fff" font-size="56" text-anchor="middle" font-family="sans-serif">${t.yaw}°</text><text x="240" y="370" fill="#fff" font-size="40" text-anchor="middle" font-family="sans-serif">pitch ${t.pitch}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export default function Page() {
  if (!demoEnabled()) notFound();
  const frames = scanTargets().map((t, i) => ({ index: i, yaw: t.yaw, pitch: t.pitch, roll: 0, width: 480, height: 640, url: label(t) }));
  return (
    <main className="mx-auto max-w-[900px] px-4 py-8">
      <ScanViewerLoader frames={frames} />
    </main>
  );
}
