/** Product naming. VeriSpace is the platform; three modules share one database and one record. */
export type ModuleKey = "suite" | "service" | "stay";

export const MODULES: Record<ModuleKey, { name: string; who: string; line: string }> = {
  suite: { name: "VeriSpace Suite", who: "Owners and managers", line: "Set up your property, room by room." },
  service: { name: "VeriService", who: "Cleaners and crew", line: "Step by step, with proof." },
  stay: { name: "VeriStay", who: "Guests", line: "Your stay, looked after." },
};

/** Which module a link role belongs to. */
export const moduleForRole = (role: "guest" | "crew" | "manager"): ModuleKey => (role === "guest" ? "stay" : role === "crew" ? "service" : "suite");
