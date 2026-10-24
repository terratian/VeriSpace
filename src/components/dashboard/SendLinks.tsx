"use client";

import { Brush, Mail, MessageSquare, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { saveStayContact, sendLink } from "@/app/dashboard/link-actions";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";
import { field, fieldLabel } from "@/components/ui/styles";

export interface CrewOption {
  id: string;
  name: string;
  phoneMasked: string | null;
  emailMasked: string | null;
}

/**
 * Links go out by text to the phone on file, or by email as the fallback. The link itself is never shown
 * here: it is sent straight to the person it is for.
 */
export function SendLinks({
  reservationId,
  guestPhone,
  guestEmail,
  guestPhoneRaw,
  guestEmailRaw,
  crew,
}: {
  reservationId: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestPhoneRaw: string;
  guestEmailRaw: string;
  crew: CrewOption[];
}) {
  const uid = useId();
  const [crewId, setCrewId] = useState(crew[0]?.id ?? "");
  const picked = crew.find((c) => c.id === crewId) ?? null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-[10px] border border-edge bg-obsidian p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-white">
          <UserRound className="size-4" aria-hidden="true" />
          VeriStay for the guest
        </p>
        <ActionForm action={sendLink} resetOnSuccess={false}>
          <input type="hidden" name="reservationId" value={reservationId} />
          <input type="hidden" name="role" value="guest" />
          <div className="mt-2 flex flex-wrap gap-2">
            <SubmitButton name="channel" value="sms" variant="secondary" size="sm" disabled={!guestPhone} pendingLabel="Sending…">
              <MessageSquare className="size-4" aria-hidden="true" />
              {guestPhone ? `Text to ${guestPhone}` : "No phone on file"}
            </SubmitButton>
            {guestEmail && (
              <SubmitButton name="channel" value="email" variant="ghost" size="sm" pendingLabel="Sending…">
                <Mail className="size-4" aria-hidden="true" />
                Email instead ({guestEmail})
              </SubmitButton>
            )}
          </div>
        </ActionForm>
        <details className="mt-2">
          <summary className="cursor-pointer text-[13px] text-mute hover:text-white">{guestPhone || guestEmail ? "Change guest contact" : "Add the guest's phone and email"}</summary>
          <ActionForm action={saveStayContact} resetOnSuccess={false} className="mt-2 grid gap-2">
            <input type="hidden" name="reservationId" value={reservationId} />
            <div>
              <label htmlFor={`${uid}-ph`} className={fieldLabel}>
                Phone on the booking
              </label>
              <input id={`${uid}-ph`} name="phone" type="tel" defaultValue={guestPhoneRaw} placeholder="+15551234567" className={field} />
            </div>
            <div>
              <label htmlFor={`${uid}-em`} className={fieldLabel}>
                Email of record
              </label>
              <input id={`${uid}-em`} name="email" type="email" defaultValue={guestEmailRaw} className={field} />
            </div>
            <div>
              <SubmitButton size="sm" pendingLabel="Saving…">
                Save contact
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      </div>

      <div className="rounded-[10px] border border-edge bg-obsidian p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-white">
          <Brush className="size-4" aria-hidden="true" />
          VeriService for the crew
        </p>
        {crew.length === 0 ? (
          <p className="mt-2 text-[13px] text-mute">Add your crew in Property settings, then send them their steps here.</p>
        ) : (
          <ActionForm action={sendLink} resetOnSuccess={false}>
            <input type="hidden" name="reservationId" value={reservationId} />
            <input type="hidden" name="role" value="crew" />
            <label className="mt-2 block">
              <span className="sr-only">Crew member</span>
              <select name="crewId" value={crewId} onChange={(e) => setCrewId(e.target.value)} className={field}>
                {crew.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <SubmitButton name="channel" value="sms" variant="secondary" size="sm" disabled={!picked?.phoneMasked} pendingLabel="Sending…">
                <MessageSquare className="size-4" aria-hidden="true" />
                {picked?.phoneMasked ? `Text to ${picked.phoneMasked}` : "No phone on file"}
              </SubmitButton>
              {picked?.emailMasked && (
                <SubmitButton name="channel" value="email" variant="ghost" size="sm" pendingLabel="Sending…">
                  <Mail className="size-4" aria-hidden="true" />
                  Email instead ({picked.emailMasked})
                </SubmitButton>
              )}
            </div>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
