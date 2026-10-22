import { describe, expect, it, vi } from "vitest";
import { errorResponse } from "./http";

describe("errorResponse", () => {
  it("names a missing setting instead of a bare internal error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("Missing required environment variable SUPABASE_SERVICE_ROLE_KEY"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
  it("hides other errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = errorResponse(new Error("db password is hunter2"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });
});
