import { describe, expect, it } from "vitest";
import { describeChange, type ChangeRow } from "./changes";

const base = { id: 1, actor_email: "a@x.test", created_at: "2026-10-24T00:00:00Z" };
describe("describeChange", () => {
  it("describes adds, removals and edits", () => {
    expect(describeChange({ ...base, table_name: "room_features", op: "INSERT", old_row: null, new_row: { name: "Oven" } } as ChangeRow)).toBe('Added asset "Oven"');
    expect(describeChange({ ...base, table_name: "rooms", op: "DELETE", old_row: { name: "Den" }, new_row: null } as ChangeRow)).toBe('Removed room "Den"');
    expect(describeChange({ ...base, table_name: "room_features", op: "UPDATE", old_row: { name: "Oven", model: "a", updated_at: 1 }, new_row: { name: "Oven", model: "b", updated_at: 2 } } as ChangeRow)).toBe('Changed asset "Oven": model');
  });
});
