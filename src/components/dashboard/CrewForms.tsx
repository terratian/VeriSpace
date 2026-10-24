"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";
import { addCrewContact, removeCrewContact } from "@/app/dashboard/link-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";

export interface CrewRow {
  id: string;
  name: string;
  phoneMasked: string | null;
  emailMasked: string | null;
}

/** The people who clean and maintain the property. Their steps are sent to the phone listed here, or the email as a fallback. */
export function CrewForms({ propertyId, crew }: { propertyId: string; crew: CrewRow[] }) {
  const uid = useId();
  return (
    <div className="mt-6 border-t border-edge pt-5">
      <h3 className="text-sm font-semibold">Crew</h3>
      <p className="mb-3 mt-1 max-w-[60ch] text-[13px] text-mute">Add each cleaner or handyperson once. VeriService steps are texted to their phone for each turnover, with email as the fallback. Links are never shown on screen.</p>
      {crew.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {crew.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 text-[13px]">
              <span>
                {c.name} <span className="text-mute">{[c.phoneMasked, c.emailMasked].filter(Boolean).join(" · ")}</span>
              </span>
              <ActionForm action={removeCrewContact} resetOnSuccess={false}>
                <input type="hidden" name="crewId" value={c.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…" confirm={`Remove ${c.name} from your crew?`}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Remove
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={addCrewContact} className="grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="propertyId" value={propertyId} />
        <div>
          <label htmlFor={`${uid}-n`} className={fieldLabel}>
            Name
          </label>
          <input id={`${uid}-n`} name="name" required maxLength={80} placeholder="Rosa" className={field} />
        </div>
        <div>
          <label htmlFor={`${uid}-p`} className={fieldLabel}>
            Mobile phone
          </label>
          <input id={`${uid}-p`} name="phone" type="tel" placeholder="+15551234567" className={field} />
        </div>
        <div>
          <label htmlFor={`${uid}-e`} className={fieldLabel}>
            Email (fallback)
          </label>
          <input id={`${uid}-e`} name="email" type="email" className={field} />
        </div>
        <div className="sm:col-span-3">
          <SubmitButton size="sm" pendingLabel="Adding…">
            Add to crew
          </SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
