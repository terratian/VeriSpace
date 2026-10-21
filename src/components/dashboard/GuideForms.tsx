"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";
import {
  addChecklistItem,
  addRoomContent,
  deleteChecklistItem,
  deleteRoomContent,
  saveProcedures,
} from "@/app/dashboard/guide-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";
import { CONTENT_KINDS, KIND_LABELS, LIMITS, type Procedures } from "@/lib/guide";

export function ProceduresForm({ propertyId, initial }: { propertyId: string; initial: Procedures }) {
  const uid = useId();
  const blocks = [
    { name: "checkin", label: "Check-in", hint: "Door code, parking, where the key is, what to do first.", value: initial.checkin },
    { name: "checkout", label: "Checkout", hint: "Before leaving: keys, trash, lights, thermostat.", value: initial.checkout },
    { name: "rules", label: "House rules", hint: "Quiet hours, smoking, pets, how many guests.", value: initial.rules },
  ];
  return (
    <ActionForm action={saveProcedures} resetOnSuccess={false} className="space-y-5">
      <input type="hidden" name="propertyId" value={propertyId} />
      {blocks.map((b) => (
        <div key={b.name}>
          <label htmlFor={`${uid}-${b.name}`} className={fieldLabel}>
            {b.label}
          </label>
          <textarea
            id={`${uid}-${b.name}`}
            name={b.name}
            rows={5}
            maxLength={LIMITS.procedure}
            defaultValue={b.value}
            className={field}
          />
          <p className="mt-1 text-[13px] text-mute">{b.hint}</p>
        </div>
      ))}
      <SubmitButton pendingLabel="Saving…">Save procedures</SubmitButton>
    </ActionForm>
  );
}

export function AddContentForm({ roomId }: { roomId: string }) {
  const uid = useId();
  return (
    <ActionForm action={addRoomContent} className="grid gap-3 sm:grid-cols-[190px_1fr]">
      <input type="hidden" name="roomId" value={roomId} />
      <div>
        <label htmlFor={`${uid}-kind`} className={fieldLabel}>
          Type
        </label>
        <select id={`${uid}-kind`} name="kind" defaultValue="tutorial" className={field}>
          {CONTENT_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${uid}-title`} className={fieldLabel}>
          Title
        </label>
        <input
          id={`${uid}-title`}
          name="title"
          required
          maxLength={LIMITS.title}
          autoComplete="off"
          placeholder="TV remote, feather pillows"
          className={field}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${uid}-body`} className={fieldLabel}>
          Details
        </label>
        <textarea id={`${uid}-body`} name="body" rows={3} maxLength={LIMITS.body} className={field} />
      </div>
      <div className="sm:col-span-2">
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add to guide
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AddChecklistForm({ roomId }: { roomId: string }) {
  const uid = useId();
  return (
    <ActionForm action={addChecklistItem} className="space-y-3">
      <input type="hidden" name="roomId" value={roomId} />
      <div>
        <label htmlFor={`${uid}-label`} className={fieldLabel}>
          Task
        </label>
        <input
          id={`${uid}-label`}
          name="label"
          required
          maxLength={LIMITS.task}
          autoComplete="off"
          placeholder="Wipe the counters"
          className={field}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-ash">
        <input type="checkbox" name="requiresPhoto" className="size-4 accent-mint" />
        Crew must take a photo to complete this task
      </label>
      <SubmitButton variant="secondary" pendingLabel="Adding…">
        Add task
      </SubmitButton>
    </ActionForm>
  );
}

function RemoveButton({ action, id, label }: { action: typeof deleteRoomContent; id: string; label: string }) {
  return (
    <ActionForm action={action} resetOnSuccess={false}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…" confirm={`Remove "${label}"?`}>
        <Trash2 className="size-4" aria-hidden="true" />
        <span className="sr-only">Remove {label}</span>
      </SubmitButton>
    </ActionForm>
  );
}

export function RemoveContentButton({ id, title }: { id: string; title: string }) {
  return <RemoveButton action={deleteRoomContent} id={id} label={title} />;
}

export function RemoveTaskButton({ id, label }: { id: string; label: string }) {
  return <RemoveButton action={deleteChecklistItem} id={id} label={label} />;
}
