"use client";

import { UserRound, Brush } from "lucide-react";
import { createLink } from "@/app/dashboard/actions";
import type { ActionResult } from "@/lib/action-state";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { CopyButton, ShareButton } from "@/components/ui/CopyButton";
import { fmtDateTime } from "@/lib/time";

function LinkResult({ link }: { link: NonNullable<ActionResult["link"]> }) {
  const who = link.role === "guest" ? "Guest" : "Crew";
  return (
    <div className="mt-3 rounded-[10px] border border-mint/30 bg-obsidian p-3">
      <p className="text-[13px] font-medium text-white">{who} link</p>
      <input
        readOnly
        value={link.url}
        aria-label={`${who} link`}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-2 w-full truncate rounded-md border border-edge bg-graphite px-2.5 py-2 font-mono text-xs text-ash"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CopyButton text={link.url} />
        <ShareButton url={link.url} title={`VeriSpace ${who.toLowerCase()} link`} />
      </div>
      <p className="mt-3 text-xs text-mute">
        Works from {fmtDateTime(link.notBefore, link.zone)} until {fmtDateTime(link.expiresAt, link.zone)}.
      </p>
      <p className="mt-1 text-xs text-mute">
        Anyone who has this link can add entries until it expires. Send it only to the person who needs it.
      </p>
    </div>
  );
}

export function LinkMaker({ reservationId }: { reservationId: string }) {
  return (
    <ActionForm action={createLink} resetOnSuccess={false}>
      {({ state }) => (
        <>
          <input type="hidden" name="reservationId" value={reservationId} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="role" value="guest" variant="secondary" size="sm">
              <UserRound className="size-4" aria-hidden="true" />
              Create guest link
            </SubmitButton>
            <SubmitButton name="role" value="crew" variant="secondary" size="sm">
              <Brush className="size-4" aria-hidden="true" />
              Create crew link
            </SubmitButton>
          </div>
          {state?.link && <LinkResult link={state.link} />}
        </>
      )}
    </ActionForm>
  );
}
