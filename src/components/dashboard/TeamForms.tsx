"use client";

import { Trash2 } from "lucide-react";
import { useId } from "react";
import { addManager, removeManager, saveAlertContacts } from "@/app/dashboard/team-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";

export interface Member {
  id: string;
  email: string;
}

/** Co-managers (owner only) and where problem alerts go. */
export function TeamForms({ propertyId, isOwner, members, alertEmail, alertPhone }: { propertyId: string; isOwner: boolean; members: Member[]; alertEmail: string | null; alertPhone: string | null }) {
  const uid = useId();
  return (
    <div className="mt-6 grid gap-8 border-t border-edge pt-5 md:grid-cols-2">
      <div>
        <h3 className="text-sm font-semibold">Managers</h3>
        <p className="mb-3 mt-1 max-w-[60ch] text-[13px] text-mute">
          A co-manager can set up rooms and assets, add stays, make links and record entries. They can&apos;t delete the property or change who manages it. They sign in with the email you add here.
        </p>
        {members.length > 0 && (
          <ul className="mb-3 space-y-1.5">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span>{m.email}</span>
                {isOwner && (
                  <ActionForm action={removeManager} resetOnSuccess={false}>
                    <input type="hidden" name="memberId" value={m.id} />
                    <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…" confirm={`Remove ${m.email} as a manager?`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                      Remove
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
        {isOwner ? (
          <ActionForm action={addManager} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="propertyId" value={propertyId} />
            <div className="min-w-[220px] flex-1">
              <label htmlFor={`${uid}-m`} className={fieldLabel}>
                Add a manager by email
              </label>
              <input id={`${uid}-m`} name="email" type="email" required placeholder="cousin@example.com" className={field} />
            </div>
            <SubmitButton size="sm" pendingLabel="Adding…">
              Add
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-[13px] text-mute">Only the owner can change this list.</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Alerts</h3>
        <p className="mb-3 mt-1 max-w-[60ch] text-[13px] text-mute">
          When a guest or crew member reports a problem or damage, or a guest says a room isn&apos;t as shown, we send it here. Leave the email blank to use your sign-in email. Texts need a number in international format.
        </p>
        <ActionForm action={saveAlertContacts} resetOnSuccess={false} className="grid gap-3">
          <input type="hidden" name="propertyId" value={propertyId} />
          <div>
            <label htmlFor={`${uid}-ae`} className={fieldLabel}>
              Alert email
            </label>
            <input id={`${uid}-ae`} name="email" type="email" defaultValue={alertEmail ?? ""} className={field} />
          </div>
          <div>
            <label htmlFor={`${uid}-ap`} className={fieldLabel}>
              Alert phone (optional)
            </label>
            <input id={`${uid}-ap`} name="phone" type="tel" defaultValue={alertPhone ?? ""} placeholder="+15551234567" className={field} />
          </div>
          <div>
            <SubmitButton size="sm" pendingLabel="Saving…">
              Save alerts
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
