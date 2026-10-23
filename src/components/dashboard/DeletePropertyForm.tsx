"use client";

import { Trash2 } from "lucide-react";
import { deleteProperty } from "@/app/dashboard/actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";

/** Remove a property: deleted if it never recorded anything, archived if it has history. */
export function DeletePropertyForm({ propertyId, name }: { propertyId: string; name: string }) {
  return (
    <div className="mt-6 border-t border-edge pt-5">
      <h3 className="text-sm font-semibold">Remove this property</h3>
      <p className="mb-3 mt-1 max-w-[60ch] text-[13px] text-mute">
        A property with nothing recorded is deleted for good, with its rooms and guides. One that already has photos or entries in its record can&apos;t be erased, so it is archived: hidden from your dashboard and its crew and guest links stop working, while the record is kept.
      </p>
      <ActionForm action={deleteProperty} resetOnSuccess={false}>
        <input type="hidden" name="propertyId" value={propertyId} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="Removing…" confirm={`Remove "${name}"? This hides it from your dashboard and switches off its links.`}>
          <Trash2 className="size-4" aria-hidden="true" />
          Remove property
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
