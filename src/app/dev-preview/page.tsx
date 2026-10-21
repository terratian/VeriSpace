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
      rooms={[
        { id: "00000000-0000-0000-0000-0000000000a1", name: "Living Room" },
        { id: "00000000-0000-0000-0000-0000000000a2", name: "Kitchen" },
        { id: "00000000-0000-0000-0000-0000000000a3", name: "Primary Bedroom" },
      ]}
      storageEnabled={true}
    />
  );
}
