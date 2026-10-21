import { notFound } from "next/navigation";
import { PropertyViewerLoader } from "@/components/dashboard/PropertyViewerLoader";
import { placeRooms } from "@/lib/model";

// Dev-only: the 3D viewer with sample data, for browser checks without signing in.
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const rooms = placeRooms([
    { id: "r1", name: "Living Room", width: 5.5, length: 4.5, height: 2.7, floor: 0, planX: null, planY: null },
    { id: "r2", name: "Kitchen", width: 4, length: 4.5, height: 2.7, floor: 0, planX: null, planY: null },
    { id: "r3", name: "Deck", width: 6, length: 3, height: 2.7, floor: 0, planX: null, planY: null },
    { id: "r4", name: "Primary Bedroom", width: 5, length: 4.5, height: 2.7, floor: 1, planX: null, planY: null },
  ]);
  return (
    <main className="mx-auto max-w-[1120px] px-4 py-8">
      <PropertyViewerLoader
        rooms={rooms}
        features={[
          { id: "f1", roomId: "r1", name: "Gas fireplace", kind: "fireplace", status: "degraded", note: "Pilot light", advertised: true, x: 0.8, y: 0.3 },
          { id: "f2", roomId: "r3", name: "Cedar hot tub", kind: "hot_tub", status: "out_of_service", note: "Pump ordered", advertised: true, x: 0.5, y: 0.5 },
          { id: "f3", roomId: "r2", name: "Espresso station", kind: "coffee_bar", status: "working", note: "", advertised: true, x: 0.3, y: 0.2 },
          { id: "f4", roomId: "r4", name: "Hybrid mattress", kind: "bed", status: "working", note: "", advertised: true, x: 0.5, y: 0.6 },
        ]}
      />
    </main>
  );
}
