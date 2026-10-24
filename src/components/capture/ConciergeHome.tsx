"use client";

import { AlertTriangle, Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/primitives";
import { button, field } from "@/components/ui/styles";
import { STAGES, searchAssets, type Stage } from "@/lib/concierge";
import type { Procedures } from "@/lib/guide";
import { FEATURE_LABELS, STATUS_LABELS } from "@/lib/model";
import { ResourceLinks } from "./RoomGuide";
import { RoomList, type RoomInfo, type RoomStatus } from "./RoomList";

function Fold({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-edge">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between py-3 text-[16px] font-medium text-white [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-mute transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4 text-[15px] leading-relaxed text-ash">{children}</div>
    </details>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="mt-6" aria-label={title}>
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span className={`inline-flex size-6 items-center justify-center rounded-full border text-[12px] ${done ? "border-mint bg-mint/15 text-mint" : "border-edge text-mute"}`}>
          {done ? <Check className="size-3.5" aria-hidden="true" /> : n}
        </span>
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** VeriStay home: three stages of a stay, each with only what a guest needs then. */
export function ConciergeHome({
  firstName,
  propertyName,
  stage,
  onStage,
  rooms,
  guide,
  statusFor,
  roomsDone,
  onOpenRoom,
  onReport,
  ack,
  checkedOut,
  onCheckout,
  busy,
  error,
}: {
  firstName?: string;
  propertyName: string;
  stage: Stage;
  onStage: (s: Stage) => void;
  rooms: RoomInfo[];
  guide: Procedures;
  statusFor: (room: RoomInfo) => RoomStatus;
  roomsDone: number;
  onOpenRoom: (room: RoomInfo) => void;
  onReport: (room: RoomInfo) => void;
  /** The "is everything as it should be" card. */
  ack: React.ReactNode;
  checkedOut: boolean;
  onCheckout: () => void;
  busy: boolean;
  error: string;
}) {
  const [query, setQuery] = useState("");
  const assets = useMemo(
    () => rooms.flatMap((r) => r.features.map((f) => ({ id: f.id, name: f.name, kind: f.kind, roomId: r.id, roomName: r.name, feature: f, room: r }))),
    [rooms],
  );
  const found = useMemo(() => searchAssets(assets, query), [assets, query]);
  const [reportRoom, setReportRoom] = useState(rooms[0]?.id ?? "");

  const greeting = stage === "checkin" ? (firstName ? `Welcome, ${firstName}` : "Welcome") : stage === "during" ? (firstName ? `Hi ${firstName}, how can we help?` : "How can we help?") : firstName ? `Thanks for staying, ${firstName}` : "Thanks for staying";

  return (
    <div>
      <h1 className="text-[28px] font-semibold leading-tight">{greeting}</h1>
      <p className="mt-1 text-mute">{propertyName}</p>

      <div role="radiogroup" aria-label="Where are you in your stay" className="mt-5 grid grid-cols-3 gap-1 rounded-xl border border-edge bg-graphite p-1">
        {STAGES.map((s) => (
          <button
            key={s.key}
            type="button"
            role="radio"
            aria-checked={stage === s.key}
            onClick={() => onStage(s.key)}
            className={`min-h-11 rounded-lg px-1 text-[13px] font-medium leading-tight transition-colors ${stage === s.key ? "bg-slate-brand text-white" : "text-mute hover:text-white"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-flag/40 bg-flag/10 px-3 py-2 text-sm text-flag">
          {error}
        </p>
      )}

      {stage === "checkin" && (
        <>
          {guide.checkin.trim() && (
            <Step n={1} title="Getting in">
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ash">{guide.checkin}</p>
            </Step>
          )}
          <Step n={2} title="Look around" done={rooms.length > 0 && roomsDone === rooms.length}>
            <p className="mb-2 max-w-[44ch] text-[13px] text-mute">Take a photo of each room as you find it, including anything already worn or marked. {roomsDone} of {rooms.length} done.</p>
            <RoomList rooms={rooms} statusFor={statusFor} onOpen={onOpenRoom} />
          </Step>
          <Step n={3} title="Confirm">
            {ack}
          </Step>
          {guide.rules.trim() && (
            <div className="mt-6 border-t border-edge">
              <Fold title="House rules">
                <p className="whitespace-pre-line">{guide.rules}</p>
              </Fold>
            </div>
          )}
        </>
      )}

      {stage === "during" && (
        <>
          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" aria-hidden="true" />
            <label htmlFor="concierge-search" className="sr-only">
              Search the house
            </label>
            <input id="concierge-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search: hot tub, TV, thermostat" className={`${field} pl-9`} />
          </div>

          <section aria-label="Help with the house" className="mt-4">
            {assets.length === 0 ? (
              <p className="text-[14px] text-mute">Your host hasn&apos;t added guides yet. Open a room below for what they&apos;ve written.</p>
            ) : found.length === 0 ? (
              <p className="text-[14px] text-mute">Nothing matches &quot;{query}&quot;. Try another word, or report a problem below.</p>
            ) : (
              <ul className="border-t border-edge">
                {found.map((a) => (
                  <li key={a.id} className="border-b border-edge py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-[16px] font-medium ${a.feature.status === "out_of_service" ? "text-mute line-through" : "text-white"}`}>{a.name}</p>
                        <p className="text-[13px] text-mute">
                          {a.roomName} · {a.feature.status === "working" ? FEATURE_LABELS[a.feature.kind] : a.feature.note || FEATURE_LABELS[a.feature.kind]}
                        </p>
                      </div>
                      {a.feature.status !== "working" && <Badge tone={a.feature.status === "degraded" ? "amber" : "red"}>{a.feature.status === "degraded" ? "Limited right now" : STATUS_LABELS.out_of_service}</Badge>}
                    </div>
                    {a.feature.resources && a.feature.resources.length > 0 && <ResourceLinks items={a.feature.resources} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Report a problem" className="mt-6 rounded-xl border border-edge bg-graphite p-4">
            <h2 className="text-[15px] font-semibold">Something not right?</h2>
            <p className="mt-1 text-[13px] text-mute">Tell us where, take a photo, and your host is notified.</p>
            <div className="mt-3 flex gap-3">
              <label htmlFor="report-room" className="sr-only">
                Which room
              </label>
              <select id="report-room" value={reportRoom} onChange={(e) => setReportRoom(e.target.value)} className={`${field} min-w-0 flex-1`}>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => { const r = rooms.find((x) => x.id === reportRoom); if (r) onReport(r); }} className={button("primary", "md")}>
                <AlertTriangle className="size-4" aria-hidden="true" />
                Report
              </button>
            </div>
          </section>

          <section aria-label="Rooms" className="mt-6">
            <h2 className="mb-2 text-[15px] font-semibold">Rooms</h2>
            <RoomList rooms={rooms} statusFor={() => ({ label: "Open", tone: "neutral" })} onOpen={onOpenRoom} />
          </section>

          {(guide.rules.trim() || guide.checkout.trim()) && (
            <div className="mt-6 border-t border-edge">
              {guide.rules.trim() && (
                <Fold title="House rules">
                  <p className="whitespace-pre-line">{guide.rules}</p>
                </Fold>
              )}
              {guide.checkout.trim() && (
                <Fold title="Checkout details">
                  <p className="whitespace-pre-line">{guide.checkout}</p>
                </Fold>
              )}
            </div>
          )}
        </>
      )}

      {stage === "checkout" && (
        <>
          {guide.checkout.trim() && (
            <Step n={1} title="Before you go">
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ash">{guide.checkout}</p>
            </Step>
          )}
          <Step n={2} title="Photograph each room" done={rooms.length > 0 && roomsDone === rooms.length}>
            <p className="mb-2 max-w-[44ch] text-[13px] text-mute">One photo of each room as you leave it. {roomsDone} of {rooms.length} done.</p>
            <RoomList rooms={rooms} statusFor={statusFor} onOpen={onOpenRoom} />
          </Step>
          <Step n={3} title="All done" done={checkedOut}>
            {checkedOut ? (
              <p className="flex items-center gap-2 rounded-xl border border-mint/40 bg-graphite px-4 py-3 text-sm">
                <Check className="size-4 shrink-0 text-mint" aria-hidden="true" />
                You&apos;re checked out. Thanks for staying with us.
              </p>
            ) : (
              <button type="button" disabled={busy} onClick={onCheckout} className={`${button("primary", "lg")} w-full`}>
                I&apos;ve checked out
              </button>
            )}
          </Step>
        </>
      )}
    </div>
  );
}
