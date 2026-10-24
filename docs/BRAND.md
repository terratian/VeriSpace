# VeriSpace brand and product names

**VeriSpace** is the platform and the company. It has three modules that share one database and one record.

| Module | Who | What it is | One line |
|---|---|---|---|
| **VeriSpace Suite** | Owners and managers | Set up each property room by room: a panorama or scan, photos of appliances and consumables, welcome and checkout guides, the checks the crew must do. Also the record, alerts, timestamps and dispute packets. | Set up your property, room by room. |
| **VeriService** | Cleaners and crew | A task-driven flow, built from what the owner set up: stand here, take this picture, tick this. Not a concierge. | Step by step, with proof. |
| **VeriStay** | Guests | A concierge for check-in, the stay and checkout: how to get in, help for what is in the room (tap a pin), report a problem, check out. | Your stay, looked after. |

Positioning line for the landing page and decks: **BIM and GIS for short-term rentals, without the engineers.**

## Naming rules

- The platform is **VeriSpace** (one word, capital V and S). Never "VerisSpace" or "Verispace" in prose. The GitHub repo is `terratian/VeriSpace`.
- Use module names for the people who use them: crew open **VeriService**, guests open **VeriStay**, owners work in **VeriSpace Suite**. Do not call the guest screen "the VeriSpace app" to a guest.
- In the product, a module is shown by its wordmark in the header (`Logo module=...`) and the page title (`VeriStay`, `VeriService`). The mark (the cube) is shared.
- We do not say blockchain, on-chain or crypto. The record is a **chain of fingerprints** with **independent timestamps**.

## Voice

- **VeriStay** speaks like a good host: warm, short, second person. "Welcome, Maya." "Need a hand with the hot tub?" Never legal or technical. No hash talk on guest screens beyond a small "recorded" confirmation.
- **VeriService** is plain and directive for people working in a second language: one action per screen, short verbs. Translation (English, Spanish, Farsi, Arabic, Hindi) comes later and should shape how text is written now: short sentences, no idioms.
- **VeriSpace Suite** is calm and exact, like a good tool. Say what happened and what to do next.
- Sentence case everywhere. No all caps labels, no arrows on buttons, no exclamation marks except in a genuine welcome.

## Visual identity

Colors and type are in [DESIGN.md](DESIGN.md). Obsidian `#0B0C10`, Slate `#1F2833`, Light Gray `#C5C6C7`, Mint `#66FCF1` (verified, or the one primary action). Guest-related information uses Sky `#7AB8FF`. The cube mark is mint on dark. Module identity comes from the wordmark and copy, not from separate colors, so the three feel like one product.

## Where the names appear in the code

`src/lib/brand.ts` (names and lines), `Logo` in `src/components/ui/primitives.tsx`, page titles in `src/app/guest/[token]`, `src/app/crew/[token]`, the landing page "Three people, one record" section.
