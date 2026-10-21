"use client";

import { useId, useState } from "react";
import { logEntry, resolveIssue } from "@/app/dashboard/issue-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";
import { CATEGORY_LABELS, ISSUE_CATEGORIES, MANUAL_ENTRY_LABELS, MANUAL_ENTRY_TYPES } from "@/lib/issues";

export interface RoomOption {
  id: string;
  name: string;
  features: { id: string; name: string }[];
}

/** Add a problem, a maintenance note, or an inspection note to a room's ledger. */
export function LogEntryForm({ rooms }: { rooms: RoomOption[] }) {
  const uid = useId();
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [type, setType] = useState<string>("issue_reported");
  const room = rooms.find((r) => r.id === roomId);
  return (
    <ActionForm action={logEntry} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`${uid}-type`} className={fieldLabel}>
          Entry
        </label>
        <select id={`${uid}-type`} name="type" value={type} onChange={(e) => setType(e.target.value)} className={field}>
          {MANUAL_ENTRY_TYPES.map((t) => (
            <option key={t} value={t}>
              {MANUAL_ENTRY_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-room`} className={fieldLabel}>
          Room
        </label>
        <select id={`${uid}-room`} name="roomId" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={field}>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-feature`} className={fieldLabel}>
          Feature (optional)
        </label>
        <select id={`${uid}-feature`} name="featureId" defaultValue="" key={roomId} className={field}>
          <option value="">The room in general</option>
          {room?.features.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      {type === "issue_reported" ? (
        <div>
          <label htmlFor={`${uid}-cat`} className={fieldLabel}>
            Kind of problem
          </label>
          <select id={`${uid}-cat`} name="category" defaultValue="" className={field}>
            <option value="">Not sure</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="category" value="" />
      )}
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-note`} className={fieldLabel}>
          {type === "issue_reported" ? "What needs attention?" : "Note"}
        </label>
        <textarea id={`${uid}-note`} name="note" rows={2} maxLength={500} className={field} placeholder="Out of toilet paper, washer won't drain, smoke alarm disabled" />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton variant="secondary" pendingLabel="Recording…">
          Record in ledger
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ResolveForm({ roomId, issueId }: { roomId: string; issueId: number }) {
  const uid = useId();
  return (
    <ActionForm action={resolveIssue} resetOnSuccess={false} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="roomId" value={roomId} />
      <input type="hidden" name="issueId" value={issueId} />
      <div className="min-w-[160px] flex-1">
        <label htmlFor={`${uid}-n`} className="sr-only">
          How it was resolved
        </label>
        <input id={`${uid}-n`} name="note" maxLength={500} autoComplete="off" placeholder="What was done (optional)" className={field} />
      </div>
      <SubmitButton variant="secondary" size="md" pendingLabel="Saving…">
        Mark resolved
      </SubmitButton>
    </ActionForm>
  );
}
