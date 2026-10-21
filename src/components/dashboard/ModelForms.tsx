"use client";

import { Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { addFeature, deleteFeature, saveRoomLayout, setFeatureStatus } from "@/app/dashboard/model-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";
import { FEATURE_KINDS, FEATURE_LABELS, FEATURE_STATUSES, STATUS_LABELS, type Feature, type FeatureStatus } from "@/lib/model";

export interface LayoutValues {
  id: string;
  widthFt: number | null;
  lengthFt: number | null;
  heightFt: number | null;
  floor: number;
  planXFt: number | null;
  planYFt: number | null;
}

export function RoomLayoutForm({ room }: { room: LayoutValues }) {
  const uid = useId();
  const inputs = [
    { name: "width", label: "Width (ft)", value: room.widthFt, hint: "13" },
    { name: "length", label: "Length (ft)", value: room.lengthFt, hint: "13" },
    { name: "height", label: "Ceiling (ft)", value: room.heightFt, hint: "9" },
    { name: "floor", label: "Floor", value: room.floor, hint: "0" },
    { name: "planX", label: "Position across (ft)", value: room.planXFt, hint: "auto" },
    { name: "planY", label: "Position down (ft)", value: room.planYFt, hint: "auto" },
  ];
  return (
    <ActionForm action={saveRoomLayout} resetOnSuccess={false} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <input type="hidden" name="roomId" value={room.id} />
      {inputs.map((i) => (
        <div key={i.name}>
          <label htmlFor={`${uid}-${i.name}`} className={fieldLabel}>
            {i.label}
          </label>
          <input
            id={`${uid}-${i.name}`}
            name={i.name}
            type="number"
            inputMode="decimal"
            step="any"
            defaultValue={i.value ?? ""}
            placeholder={i.hint}
            className={field}
          />
        </div>
      ))}
      <div className="col-span-full">
        <SubmitButton variant="secondary" pendingLabel="Saving…">
          Save room
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

const DOT: Record<FeatureStatus, string> = { working: "fill-mint", degraded: "fill-amber", out_of_service: "fill-flag" };

/** Add a feature to a room by clicking where it sits on a top-down sketch of the room. */
export function FeaturePlacer({
  room,
  features,
  statuses,
}: {
  room: { id: string; name: string; widthFt: number; lengthFt: number };
  features: Feature[];
  statuses: Record<string, FeatureStatus>;
}) {
  // Remount after each add so the name and pin reset.
  return <PlacerForm key={features.length} room={room} features={features} statuses={statuses} />;
}

function PlacerForm({
  room,
  features,
  statuses,
}: {
  room: { id: string; name: string; widthFt: number; lengthFt: number };
  features: Feature[];
  statuses: Record<string, FeatureStatus>;
}) {
  const uid = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const ratio = Math.min(1.6, Math.max(0.4, room.lengthFt / room.widthFt));
  const H = 100 * ratio;
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

  function pick(e: React.PointerEvent<SVGSVGElement>) {
    const r = svg.current?.getBoundingClientRect();
    if (!r || r.width === 0 || r.height === 0) return;
    setPos({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
  }

  return (
    <ActionForm action={addFeature} resetOnSuccess={false} className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr]">
      <input type="hidden" name="roomId" value={room.id} />
      <div>
        <p className={fieldLabel}>Click where it sits in the room</p>
        <svg
          ref={svg}
          viewBox={`0 0 100 ${H}`}
          role="img"
          aria-label={`Top-down sketch of ${room.name}. Click to place the feature, or type the position.`}
          onPointerDown={pick}
          className="w-full cursor-crosshair touch-none rounded-lg border border-edge bg-obsidian"
        >
          {features.map((f) => (
            <circle key={f.id} cx={f.x * 100} cy={(f.y * H) | 0} r="2.6" className={DOT[statuses[f.id] ?? "working"]}>
              <title>{f.name}</title>
            </circle>
          ))}
          <circle cx={pos.x} cy={(pos.y / 100) * H} r="3.4" fill="none" strokeWidth="1.2" className="stroke-amber" />
        </svg>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-x`} className={fieldLabel}>
              Across (%)
            </label>
            <input id={`${uid}-x`} name="xPct" type="number" min={0} max={100} value={pos.x} onChange={(e) => setPos((p) => ({ ...p, x: clamp(Number(e.target.value)) }))} className={field} />
          </div>
          <div>
            <label htmlFor={`${uid}-y`} className={fieldLabel}>
              Down (%)
            </label>
            <input id={`${uid}-y`} name="yPct" type="number" min={0} max={100} value={pos.y} onChange={(e) => setPos((p) => ({ ...p, y: clamp(Number(e.target.value)) }))} className={field} />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label htmlFor={`${uid}-kind`} className={fieldLabel}>
            Type
          </label>
          <select id={`${uid}-kind`} name="kind" defaultValue="other" className={field}>
            {FEATURE_KINDS.map((k) => (
              <option key={k} value={k}>
                {FEATURE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-name`} className={fieldLabel}>
            Name
          </label>
          <input id={`${uid}-name`} name="name" required maxLength={80} autoComplete="off" placeholder="Cedar hot tub" className={field} />
        </div>
        <div>
          <label htmlFor={`${uid}-details`} className={fieldLabel}>
            Details (optional)
          </label>
          <input id={`${uid}-details`} name="details" maxLength={500} autoComplete="off" placeholder="Seats 6, open 8am to 10pm" className={field} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ash">
          <input type="checkbox" name="advertised" defaultChecked className="size-4 accent-mint" />
          Show to guests as part of the listing
        </label>
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add feature
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RemoveFeatureButton({ id, name }: { id: string; name: string }) {
  return (
    <ActionForm action={deleteFeature} resetOnSuccess={false}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        variant="ghost"
        size="sm"
        pendingLabel="Removing…"
        confirm={`Remove "${name}"? Its history stays in the ledger.`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="sr-only">Remove {name}</span>
      </SubmitButton>
    </ActionForm>
  );
}

/** Set a feature's status. Each change is a new ledger entry. */
export function StatusForm({ featureId, name, status, note }: { featureId: string; name: string; status: FeatureStatus; note: string }) {
  const uid = useId();
  return (
    <ActionForm action={setFeatureStatus} resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="featureId" value={featureId} />
      <div>
        <label htmlFor={`${uid}-s`} className="sr-only">
          Status of {name}
        </label>
        <select id={`${uid}-s`} name="status" defaultValue={status} className={`${field} !w-auto`}>
          {FEATURE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-[140px] flex-1">
        <label htmlFor={`${uid}-n`} className="sr-only">
          Note for {name}
        </label>
        <input id={`${uid}-n`} name="note" defaultValue={note} maxLength={300} autoComplete="off" placeholder="Note, such as pump failed" className={field} />
      </div>
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Record
      </SubmitButton>
    </ActionForm>
  );
}
