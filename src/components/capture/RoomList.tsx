"use client";

import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { Tone } from "@/components/ui/styles";
import type { ChecklistItem, RoomContent } from "@/lib/guide";

export interface RoomInfo {
  id: string;
  name: string;
  /** What the manager wrote about the room for guests. */
  content: RoomContent[];
  /** The room's tasks for the crew. */
  checklist: ChecklistItem[];
  /** Task ids already recorded for this stay. */
  doneItems: string[];
}

export interface RoomStatus {
  label: string;
  tone: Tone;
}

/** Rooms as large ruled rows: easy to hit with a thumb, status readable at a glance. */
export function RoomList({
  rooms,
  statusFor,
  onOpen,
}: {
  rooms: RoomInfo[];
  statusFor: (room: RoomInfo) => RoomStatus;
  onOpen: (room: RoomInfo) => void;
}) {
  return (
    <ul className="border-t border-edge">
      {rooms.map((room) => {
        const status = statusFor(room);
        return (
          <li key={room.id} className="border-b border-edge">
            <button
              type="button"
              onClick={() => onOpen(room)}
              className="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left"
            >
              <span className="text-[17px] font-medium text-white">{room.name}</span>
              <span className="flex items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                <ChevronRight className="size-5 text-mute" aria-hidden="true" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
