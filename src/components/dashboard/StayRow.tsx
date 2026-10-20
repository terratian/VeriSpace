import { cancelReservation } from "@/app/dashboard/actions";
import { LinkMaker } from "@/components/dashboard/LinkMaker";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { Badge } from "@/components/ui/primitives";
import { SOURCE_LABEL, type Source } from "@/lib/reservations";
import { fmtDateTime, nightsBetween, stayStatus } from "@/lib/time";

export interface StayData {
  id: string;
  starts_at: string;
  ends_at: string;
  guest_name: string | null;
  source: Source;
}

const STATUS = {
  upcoming: { tone: "amber", label: "Upcoming" },
  "in-house": { tone: "sky", label: "In house" },
  past: { tone: "neutral", label: "Past" },
} as const;

export function StayRow({ stay, tz, now }: { stay: StayData; tz: string; now: Date }) {
  const status = stayStatus(now, stay.starts_at, stay.ends_at);
  const nights = nightsBetween(stay.starts_at, stay.ends_at, tz);

  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
        <p className="font-medium text-white">{stay.guest_name || "Guest not named"}</p>
        <span className="text-[13px] text-mute">{SOURCE_LABEL[stay.source] ?? stay.source}</span>
      </div>
      <p className="mt-1.5 text-sm text-ash">
        <span className="tabular-nums">{fmtDateTime(stay.starts_at, tz)}</span>
        <span className="text-mute"> to </span>
        <span className="tabular-nums">{fmtDateTime(stay.ends_at, tz)}</span>
        <span className="text-mute">, {nights} {nights === 1 ? "night" : "nights"}</span>
      </p>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        {status !== "past" ? <LinkMaker reservationId={stay.id} /> : <span />}
        <ActionForm action={cancelReservation} resetOnSuccess={false}>
          <input type="hidden" name="reservationId" value={stay.id} />
          <SubmitButton
            variant="ghost"
            size="sm"
            confirm="Remove this stay? Links already created for it keep working until they expire."
          >
            Remove
          </SubmitButton>
        </ActionForm>
      </div>
    </li>
  );
}
