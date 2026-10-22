import { notFound } from "next/navigation";
import ScanCapture from "@/components/dashboard/ScanCapture";
import { demoEnabled } from "@/lib/demo";

// Demo: the guided scan with nothing saved.
export default function Page() {
  if (!demoEnabled()) notFound();
  return (
    <main className="mx-auto max-w-[720px] px-4 py-8">
      <ScanCapture demo roomId="00000000-0000-0000-0000-0000000000a1" roomName="Living Room" token="demo" />
    </main>
  );
}
