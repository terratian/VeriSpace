"use client";

import { useId } from "react";
import { addRoom } from "@/app/dashboard/actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";

export function AddRoomForm({ propertyId }: { propertyId: string }) {
  const uid = useId();
  return (
    <ActionForm action={addRoom}>
      <input type="hidden" name="propertyId" value={propertyId} />
      <label htmlFor={uid} className={fieldLabel}>
        Add a room
      </label>
      <div className="flex gap-2">
        <input id={uid} name="name" required maxLength={120} autoComplete="off" placeholder="Living room" className={field} />
        <SubmitButton variant="secondary" pendingLabel="Adding…">
          Add
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
