/**
 * Whether a property is ready to rent again, worked out from the ledger for one stay's turnover.
 * Nothing here is stored: the ledger entries are the record, and this reads them.
 */

export interface ReadyRoom {
  id: string;
  name: string;
  items: { id: string; requiresPhoto: boolean }[];
}

export interface ReadyEvent {
  room_id: string;
  event_type: string;
  payload: unknown;
  frame_sha256: string | null;
}

export interface RoomReadiness {
  roomId: string;
  name: string;
  started: boolean;
  finished: boolean;
  itemsDone: number;
  itemsTotal: number;
  damage: number;
  /** Finished, and every checklist task recorded (with a photo where one is required). */
  ready: boolean;
}

export type ReadyState = "no_rooms" | "not_started" | "in_progress" | "ready";

export interface Readiness {
  state: ReadyState;
  rooms: RoomReadiness[];
  damage: number;
}

function itemIdOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const id = (payload as { itemId?: unknown }).itemId;
  return typeof id === "string" ? id : null;
}

/**
 * Ids of the tasks recorded in `events`. A task counts once however often it was recorded, only if it
 * names a real task of the room, and a task that needs a photo only counts when the entry carries one.
 */
export function doneItemIds(
  items: ReadyRoom["items"],
  events: Pick<ReadyEvent, "event_type" | "payload" | "frame_sha256">[],
): Set<string> {
  const done = new Set<string>();
  for (const e of events) {
    if (e.event_type !== "checklist_item") continue;
    const id = itemIdOf(e.payload);
    const item = id ? items.find((i) => i.id === id) : undefined;
    if (!id || !item) continue;
    if (item.requiresPhoto && !e.frame_sha256) continue;
    done.add(id);
  }
  return done;
}

export function computeReadiness(rooms: ReadyRoom[], events: ReadyEvent[]): Readiness {
  const byRoom = new Map<string, ReadyEvent[]>();
  for (const e of events) {
    const list = byRoom.get(e.room_id) ?? [];
    list.push(e);
    byRoom.set(e.room_id, list);
  }

  let damage = 0;
  const out: RoomReadiness[] = rooms.map((room) => {
    const list = byRoom.get(room.id) ?? [];
    const finished = list.some((e) => e.event_type === "clean_end");

    // A task counts once however many times it was recorded, and only if it names a real task of this
    // room. A task that needs a photo only counts when the entry carries a photo fingerprint.
    const done = doneItemIds(room.items, list);

    const roomDamage = list.filter((e) => e.event_type === "damage_report").length;
    damage += roomDamage;
    return {
      roomId: room.id,
      name: room.name,
      started: finished || list.length > 0,
      finished,
      itemsDone: done.size,
      itemsTotal: room.items.length,
      damage: roomDamage,
      ready: finished && done.size === room.items.length,
    };
  });

  let state: ReadyState;
  if (rooms.length === 0) state = "no_rooms";
  else if (out.every((r) => r.ready)) state = "ready";
  else if (!out.some((r) => r.started)) state = "not_started";
  else state = "in_progress";

  return { state, rooms: out, damage };
}
