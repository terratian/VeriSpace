/** How far along a property's setup is, worked out from what already exists. Nothing is stored. */

export interface SetupInput {
  rooms: number;
  roomsSized: number;
  features: number;
  baselines: number;
  guideItems: number;
  stays: number;
}

export interface SetupStep {
  key: "rooms" | "layout" | "features" | "baseline" | "guide" | "stay";
  label: string;
  hint: string;
  done: boolean;
  href: string;
}

export const ROOM_PRESETS = [
  "Living room",
  "Kitchen",
  "Dining room",
  "Primary bedroom",
  "Bedroom 2",
  "Bedroom 3",
  "Bathroom",
  "Laundry",
  "Office",
  "Deck or patio",
  "Garage",
  "Entry",
] as const;

export function setupSteps(i: SetupInput, base: string): SetupStep[] {
  return [
    { key: "rooms", label: "Add the rooms", hint: "Pick from common rooms or type your own.", done: i.rooms > 0, href: `${base}/setup?step=rooms` },
    {
      key: "layout",
      label: "Lay out the space",
      hint: "Drag rooms into place and size them. The 3D model follows.",
      done: i.rooms > 0 && i.roomsSized === i.rooms,
      href: `${base}/setup?step=layout`,
    },
    { key: "features", label: "Pin features and assets", hint: "Hot tub, fireplace, lock, Wi-Fi, appliances, beds.", done: i.features > 0, href: `${base}/setup?step=features` },
    { key: "baseline", label: "Take baseline photos", hint: "Walk the property on your phone. This is the record everything is checked against.", done: i.baselines > 0, href: `${base}/setup?step=baseline` },
    { key: "guide", label: "Write the guest guide", hint: "Check-in and checkout, house rules, how things work, allergen notes, crew tasks.", done: i.guideItems > 0, href: `${base}/guide` },
    { key: "stay", label: "Add a stay and send links", hint: "Add a booking, then create the guest and crew links.", done: i.stays > 0, href: `${base}#stays` },
  ];
}

export const nextStep = (steps: SetupStep[]): SetupStep | null => steps.find((s) => !s.done) ?? null;
