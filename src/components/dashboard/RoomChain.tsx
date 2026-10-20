"use client";

import { verifyRoom } from "@/app/dashboard/actions";
import { ChainStrip, type ChainEntry, type ChainState } from "@/components/ChainStrip";
import { ActionForm, SubmitButton } from "@/components/ui/ActionForm";

export function RoomChain({ roomId, name, entries, total }: { roomId: string; name: string; entries: ChainEntry[]; total: number }) {
  return (
    <ActionForm action={verifyRoom} resetOnSuccess={false}>
      {({ state }) => {
        const chain = state?.chain;
        const chainState: ChainState = chain ? (chain.intact ? "intact" : "broken") : "unchecked";
        return (
          <>
            <input type="hidden" name="roomId" value={roomId} />
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-white">{name}</p>
              <span className="text-xs tabular-nums text-mute">
                {total} {total === 1 ? "entry" : "entries"}
              </span>
            </div>
            <div className="mt-3 min-h-3">
              <ChainStrip entries={entries} total={total} state={chainState} brokenSeq={chain?.brokenSeq} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p role="status" className={`text-xs ${chain ? (chain.intact ? "text-mint" : "text-flag") : "text-mute"}`}>
                {chain
                  ? chain.intact
                    ? `Verified ${chain.checked} ${chain.checked === 1 ? "entry" : "entries"}`
                    : `Chain breaks at entry ${chain.brokenSeq}`
                  : "Not verified yet"}
              </p>
              {total > 0 && (
                <SubmitButton variant="secondary" size="sm" pendingLabel="Verifying…">
                  Verify chain
                </SubmitButton>
              )}
            </div>
          </>
        );
      }}
    </ActionForm>
  );
}
