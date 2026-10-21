import { notFound } from "next/navigation";
import CaptureApp from "@/components/capture/CaptureApp";

// Dev-only harness for browser tests of the capture screen (see scripts/capture-flow.mjs).
export default function Preview({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  return <Harness searchParams={searchParams} />;
}

async function Harness({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { role } = await searchParams;
  const r = role === "guest" ? "guest" : "crew";
  const now = Date.now();
  return (
    <CaptureApp
      token="preview-token"
      role={r}
      propertyName="Cedar Hollow Cabin"
      guestName="Maya Ortiz"
      endsAt={new Date(now + 20 * 3600_000).toISOString()}
      expiresAt={new Date(now + 30 * 3600_000).toISOString()}
      guide={{
        checkin: "Door code is on your booking. Parking is behind the cabin.",
        checkout: "Start the dishwasher and leave keys on the hook by 11am.",
        rules: "No smoking. Quiet hours 10pm to 8am.",
      }}
      rooms={[
        { id: "00000000-0000-0000-0000-0000000000a1", name: "Living Room", content: [{ id: "c1", kind: "tutorial", title: "Fireplace", body: "Open the flue first." }], checklist: [], doneItems: [] },
        {
          id: "00000000-0000-0000-0000-0000000000a2",
          name: "Kitchen",
          content: [{ id: "c2", kind: "allergen", title: "Peanuts", body: "Jars in the pantry may contain peanuts." }],
          checklist: [
            { id: "t1", label: "Wipe counters", requiresPhoto: false },
            { id: "t2", label: "Empty the fridge", requiresPhoto: true },
          ],
          doneItems: [],
        },
        { id: "00000000-0000-0000-0000-0000000000a3", name: "Primary Bedroom", content: [], checklist: [], doneItems: [] },
      ]}
      storageEnabled={true}
    />
  );
}
