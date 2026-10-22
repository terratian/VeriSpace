import { notFound } from "next/navigation";
import { LayoutStudio } from "@/components/dashboard/LayoutStudio";
import { demoEnabled } from "@/lib/demo";

// Demo: the drag-and-drop layout studio with sample rooms. Nothing is saved.
export default function Page() {
  if (!demoEnabled()) notFound();
  return (
    <main className="mx-auto max-w-[1120px] px-4 py-8">
      <h1 className="mb-4 text-2xl font-semibold">Layout studio</h1>
      <LayoutStudio
        demo
        rooms={[
          { id: "r1", name: "Living Room", x: 0, y: 0, w: 18, d: 15, h: 9, floor: 0 },
          { id: "r2", name: "Kitchen", x: 19, y: 0, w: 13, d: 15, h: 9, floor: 0 },
          { id: "r3", name: "Deck", x: 0, y: 16, w: 20, d: 10, h: 9, floor: 0 },
          { id: "r4", name: "Primary Bedroom", x: 0, y: 0, w: 16, d: 14, h: 9, floor: 1 },
        ]}
        features={[
          { id: "f1", roomId: "r1", name: "Gas fireplace", kind: "fireplace", status: "degraded", note: "Pilot light", advertised: true, x: 0.8, y: 0.3 },
          { id: "f2", roomId: "r3", name: "Cedar hot tub", kind: "hot_tub", status: "out_of_service", note: "Pump ordered", advertised: true, x: 0.5, y: 0.5 },
        ]}
      />
    </main>
  );
}
