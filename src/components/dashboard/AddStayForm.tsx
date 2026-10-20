"use client";

import { useId } from "react";
import { addReservation } from "@/app/dashboard/actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";
import { DEFAULT_CHECK_IN, DEFAULT_CHECK_OUT, SOURCES, SOURCE_LABEL } from "@/lib/reservations";

export function AddStayForm({ propertyId, zoneLabel }: { propertyId: string; zoneLabel: string }) {
  const uid = useId();
  return (
    <ActionForm action={addReservation} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="propertyId" value={propertyId} />
      <div>
        <label htmlFor={`${uid}-guest`} className={fieldLabel}>
          Guest name (optional)
        </label>
        <input id={`${uid}-guest`} name="guestName" maxLength={120} autoComplete="off" placeholder="Jo Smith" className={field} />
      </div>
      <div>
        <label htmlFor={`${uid}-source`} className={fieldLabel}>
          Booked through
        </label>
        <select id={`${uid}-source`} name="source" defaultValue="airbnb" className={field}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label htmlFor={`${uid}-in`} className={fieldLabel}>
            Check-in
          </label>
          <input id={`${uid}-in`} name="checkInDate" type="date" required className={field} />
        </div>
        <div>
          <label htmlFor={`${uid}-int`} className={fieldLabel}>
            Time
          </label>
          <input id={`${uid}-int`} name="checkInTime" type="time" required defaultValue={DEFAULT_CHECK_IN} className={field} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label htmlFor={`${uid}-out`} className={fieldLabel}>
            Check-out
          </label>
          <input id={`${uid}-out`} name="checkOutDate" type="date" required className={field} />
        </div>
        <div>
          <label htmlFor={`${uid}-outt`} className={fieldLabel}>
            Time
          </label>
          <input id={`${uid}-outt`} name="checkOutTime" type="time" required defaultValue={DEFAULT_CHECK_OUT} className={field} />
        </div>
      </div>

      <p className="text-[13px] text-mute sm:col-span-2">Times are at the property ({zoneLabel}).</p>
      <div className="sm:col-span-2">
        <SubmitButton pendingLabel="Adding…">Add stay</SubmitButton>
      </div>
    </ActionForm>
  );
}
