import { headers } from "next/headers";
import { Panel } from "@/components/ui/primitives";
import { requestOrigin } from "@/lib/origin";
import { qrDataUrl } from "@/lib/qr";

/** A QR code that opens a page of the dashboard on a phone, always visible so it can be scanned straight off the screen. */
export async function PhoneQr({ path, title, children }: { path: string; title: string; children?: React.ReactNode }) {
  const url = `${requestOrigin(await headers())}${path}`;
  const qr = await qrDataUrl(url);
  return (
    <Panel className="mt-6 flex max-w-[620px] items-center gap-4 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt={`QR code that opens ${title} on a phone`} width={132} height={132} className="shrink-0 rounded-lg" />
      <div>
        <h2 className="text-[15px] font-semibold">Use your phone for the photos</h2>
        <p className="mt-1 text-sm text-ash">{children ?? `Point your phone's camera at the code to open ${title}. Sign in if it asks.`}</p>
      </div>
    </Panel>
  );
}
