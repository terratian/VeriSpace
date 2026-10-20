# VeriSpace design notes

Brand colours are fixed by the Project Bible (Obsidian `#0B0C10`, Mint `#66FCF1`). This file records the choices made inside that constraint.

## Palette

| Name | Hex | Used for |
|---|---|---|
| Obsidian | `#0B0C10` | Page background, input fill |
| Graphite | `#12151C` | Panels |
| Slate | `#1F2833` | Raised controls |
| Edge | `#252D39` | Hairlines and borders |
| Ash | `#C5C6C7` | Body text |
| Mute | `#8E98A5` | Secondary text (6:1 on Obsidian) |
| Mint | `#66FCF1` | **Verified** and the one primary action on a screen. Never decoration. |
| Amber | `#F2B544` | Needs attention (upcoming, unchecked) |
| Flag | `#FF6B6B` | Damage, broken chain, errors |
| Sky | `#7AB8FF` | Guest-related information |

## Type

- **Instrument Sans Variable** for everything. Headings use tight tracking (-0.02em), sentence case.
- **JetBrains Mono Variable** only for data that is genuinely machine text: hashes, sequence numbers.
- Scale: 12 / 13 / 15 (body) / 17 / 22 / 30 / 48. Form inputs stay at 16 px on phones so iOS does not zoom.
- Measure under 68 characters.

## Layout

- Manager app: one 1120 px column under a slim top bar. Lists are ruled rows (hairline dividers), not grids of cards. Property page has a main column (stays, activity) and a 340 px rail (rooms and their chains).
- Capture screens: one 480 px column, large touch targets (48 px minimum), actions anchored near the thumb, camera full-screen.

## The one memorable thing

The **chain strip**: each room's record drawn as linked squares. Dashed grey until the chain is verified, solid mint when intact, red from the first broken entry. At capture time the SHA-256 fingerprint resolves on screen character by character, once, so the person sees what their photo became.

## Rules

- Mint means verified or primary. If something is mint and is neither, change it.
- No all-caps labels, no arrows appended to buttons, no gradient washes, no decorative motion. Motion only answers an action (shutter flash, fingerprint resolve).
- Respect `prefers-reduced-motion` (handled globally in `globals.css`).
- Copy: sentence case, say what happens ("Create guest link", not "Submit"), errors say what to do.
